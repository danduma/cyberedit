import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer, MarkdownSerializerState } from "prosemirror-markdown";
import MarkdownIt from "markdown-it";
import { citationSchema } from "../lib/prosemirror-schema";

function convertFootnotesToLists(markdown: string): string {
    // ProseMirror's default markdown schema doesn't support footnotes.
    // Convert footnote syntax into regular list syntax so it renders cleanly in the editor.
    //
    // Example:
    // [^1]: Reference text
    // becomes:
    // 1. Reference text
    //
    // Inline refs:
    // [^1] becomes [1]
    const lines = markdown.split(/\r?\n/);
    const output: string[] = [];
    let inConvertedFootnoteBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const defMatch = /^\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(line);
        if (!defMatch) {
            // Avoid converting the footnote-definition marker itself; only convert inline refs.
            output.push(line.replace(/\[\^([^\]]+)\](?!:)/g, (_m, label: string) => `[${label}]`));
            inConvertedFootnoteBlock = false;
            continue;
        }

        const label = defMatch[1];
        const content = defMatch[2] ?? "";
        const isNumeric = /^\d+$/.test(label);

        if (!inConvertedFootnoteBlock && output.length > 0 && output[output.length - 1] !== "") {
            // Ensure list parses as a list (not part of a paragraph) in markdown-it.
            output.push("");
        }

        if (isNumeric) {
            output.push(`${label}. ${content}`);
        } else {
            output.push(`- [${label}] ${content}`);
        }

        // Consume indented continuation lines and indent them as list continuations.
        while (i + 1 < lines.length && (/^\s{4,}\S/.test(lines[i + 1]) || /^\t\S/.test(lines[i + 1]) || lines[i + 1] === "")) {
            const nextLine = lines[i + 1];
            if (nextLine === "") {
                output.push("");
            } else {
                // 3 spaces keeps content within the list item for both "1." and "-" bullets.
                output.push(`   ${nextLine.replace(/^\s{4,}|\t/, "")}`);
            }
            i++;
        }

        inConvertedFootnoteBlock = true;
    }

    return output.join("\n");
}

// Preprocess markdown to convert HTML img tags to markdown image syntax
function preprocessMarkdown(markdown: string): string {
    // Convert HTML img tags to markdown image syntax
    // First handle img tags with alt attribute (more specific match)
    const htmlImgWithAltRegex = /<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi;
    const htmlImgWithAltReversedRegex = /<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*>/gi;
    const htmlImgNoAltRegex = /<img(?![^>]*alt\s*=)[^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi;

    let processed = markdown;

    // Handle img tags with alt attribute (alt before src)
    processed = processed.replace(htmlImgWithAltRegex, (match, alt, src) => {
        return `![${alt}](${src})`;
    });

    // Handle img tags with alt attribute (src before alt)
    processed = processed.replace(htmlImgWithAltReversedRegex, (match, src, alt) => {
        return `![${alt}](${src})`;
    });

    // Handle img tags without alt attribute
    processed = processed.replace(htmlImgNoAltRegex, (match, src) => {
        return `![](${src})`;
    });

    processed = convertFootnotesToLists(processed);

    return processed;
}

const tokens = {
    ...defaultMarkdownParser.tokens,
    image: {
        node: "image",
        getAttrs: (token: any) => {
            return {
                src: token.attrGet("src"),
                alt: token.content,
                title: token.attrGet("title") || null
            }
        }
    },
    table: {
        block: "table"
    },
    thead: {
        block: "table_head"
    },
    tbody: {
        block: "table_body"
    },
    tr: {
        block: "table_row"
    },
    th: {
        block: "table_header",
        getAttrs: (token: any) => ({
            align: getTokenTextAlign(token)
        })
    },
    td: {
        block: "table_cell",
        getAttrs: (token: any) => ({
            align: getTokenTextAlign(token)
        })
    },
    // Ignore HTML blocks and inline HTML - they're not supported in the schema
    // Users should use markdown syntax instead
    html_block: { ignore: true },
    html_inline: { ignore: true }
};

function getTokenTextAlign(token: any): string | null {
    const style = token?.attrGet?.("style") || "";
    const match = /text-align\s*:\s*(left|right|center)\s*;?/i.exec(style);
    return match ? match[1].toLowerCase() : null;
}

const tokenizer = new MarkdownIt("default", {
    ...defaultMarkdownParser.tokenizer.options,
    // Explicitly enable table support and HTML
    html: true,
    linkify: false,
    typographer: false
});
tokenizer.disable("strikethrough");
tokenizer.enable("table");

const parser = new MarkdownParser(
    citationSchema,
    tokenizer,
    tokens
);

// Create a serializer that uses the default serializer's configuration
const serializer = new MarkdownSerializer(
    {
        ...defaultMarkdownSerializer.nodes,
        frontmatter: (state, node) => {
            state.write("---\n");
            state.write(node.attrs.rawYaml || "");
            if (node.attrs.rawYaml && !node.attrs.rawYaml.endsWith('\n')) {
                state.write('\n');
            }
            state.write("---\n\n");
            state.closeBlock(node);
        },
        table: (state, node) => {
            const head = node.childCount > 0 && node.child(0).type.name === "table_head" ? node.child(0) : null;
            const body = head ? (node.childCount > 1 ? node.child(1) : null) : (node.childCount > 0 ? node.child(0) : null);
            const headerRow = head?.childCount ? head.child(0) : (body?.childCount ? body.child(0) : null);
            if (!headerRow) {
                state.closeBlock(node);
                return;
            }

            const colCount = headerRow.childCount;
            const headerCells = [];
            const alignCells = [];
            for (let i = 0; i < colCount; i++) {
                const cell = headerRow.child(i);
                headerCells.push(renderTableCellInline(state, cell));
                alignCells.push(cell.attrs?.align || null);
            }

            const separatorCells = alignCells.map((align: string | null) => {
                if (align === "left") return ":---";
                if (align === "right") return "---:";
                if (align === "center") return ":---:";
                return "---";
            });

            const lines: string[] = [];
            lines.push(`| ${headerCells.join(" | ")} |`);
            lines.push(`| ${separatorCells.join(" | ")} |`);

            const bodyRows: any[] = [];
            if (body) {
                for (let i = 0; i < body.childCount; i++) bodyRows.push(body.child(i));
            } else if (head) {
                for (let i = 1; i < head.childCount; i++) bodyRows.push(head.child(i));
            }

            const skipFirstBodyRow = !head && bodyRows.length > 0 && bodyRows[0] === headerRow;

            for (let r = 0; r < bodyRows.length; r++) {
                if (skipFirstBodyRow && r === 0) continue;
                const row = bodyRows[r];
                const rowCells = [];
                for (let c = 0; c < colCount; c++) {
                    const cell = row.childCount > c ? row.child(c) : null;
                    rowCells.push(cell ? renderTableCellInline(state, cell) : "");
                }
                lines.push(`| ${rowCells.join(" | ")} |`);
            }

            state.ensureNewLine();
            state.write(lines.join("\n") + "\n");
            state.closeBlock(node);
        }
    },
    defaultMarkdownSerializer.marks
);

function renderTableCellInline(state: any, cell: any): string {
    const CellState = MarkdownSerializerState as any;
    const cellState = new CellState((state as any).nodes, (state as any).marks, (state as any).options) as any;
    cellState.renderInline(cell, false);
    const raw = (cellState.out || "").trim().replace(/\n+/g, " ");
    return raw
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|");
}

export function parseMarkdownToProseMirror(markdown: string) {
    try {
        let frontmatter = "";
        let content = markdown;

        // Check for frontmatter
        if (markdown.startsWith('---\n')) {
            const endMatch = markdown.indexOf('\n---\n', 4);
            if (endMatch !== -1) {
                frontmatter = markdown.substring(4, endMatch);
                content = markdown.substring(endMatch + 5);
            }
        }

        // First, render HTML img tags to markdown syntax
        const processedMarkdown = preprocessMarkdown(content);

        // Parse the processed markdown
        const doc = parser.parse(processedMarkdown);

        if (!doc) {
            console.error('Failed to parse markdown, returning empty doc');
            return citationSchema.node('doc', null, [citationSchema.node('paragraph')]);
        }

        if (frontmatter && doc) {
            const fmNode = citationSchema.nodes.frontmatter.create({ rawYaml: frontmatter });

            // Create a new document with the frontmatter node prepended
            const nodes: any[] = [fmNode];
            doc.content.forEach(n => nodes.push(n));

            return citationSchema.node("doc", null, nodes);
        }

        return doc;
    } catch (error) {
        console.error('Error parsing markdown:', error);
        console.error('Markdown content:', markdown.substring(0, 500));
        // Return a minimal valid document
        return citationSchema.node('doc', null, [
            citationSchema.node('paragraph', null, [
                citationSchema.text('Error parsing document. Please check the markdown syntax.')
            ])
        ]);
    }
}

// Image URL resolver function
export function resolveImageUrl(src: string, ticketId?: string, apiBaseUrl?: string) {
    if (!src) return src;

    // If it's already an absolute URL or data URL, return as is
    if (src.startsWith('http') || src.startsWith('https') || src.startsWith('data:')) {
        return src;
    }

    // If we have a ticket ID, convert relative paths to API endpoints
    if (ticketId) {
        const baseUrl = apiBaseUrl || '/api';

        // Clean path to remove leading relative indicators to ensure path is relative to root
        // Remove leading slash, ./, and ../ sequences
        let cleanPath = src;
        while (cleanPath.startsWith('/') || cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
            if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
            else if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
            else if (cleanPath.startsWith('../')) cleanPath = cleanPath.substring(3);
        }

        const url = `${baseUrl}/tickets/${ticketId}/pr/file-bytes?file_path=${encodeURIComponent(cleanPath)}`;
        
        // Return URL with auth token if available in localStorage
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        if (token) {
            // Note: Images loaded via <img> tags don't support headers.
            // We need to pass the token as a query parameter if the backend supports it,
            // or rely on cookies if authentication uses cookies.
            // Assuming the backend accepts 'token' query param for this specific endpoint.
            // If the backend only accepts Authorization header, we would need to fetch the image 
            // via fetch() with headers, create a blob URL, and use that instead.
            
            // Checking if we can append token
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}token=${token}`;
        }
        
        return url;
    }

    return src;
}

export function convertProseMirrorToMarkdown(doc: any) {
    return serializer.serialize(doc);
}
