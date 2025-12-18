import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import { citationSchema } from "../lib/prosemirror-schema";

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

    // Convert references from [^N] to [N]
    // The citation plugin likely expects [N] format based on insertCitation implementation
    processed = processed.replace(/\[\^(\d+)\]/g, '[$1]');

    // Handle references/citations to ensure they break into new lines
    // Force double newlines before references like [1], [12], etc.
    // This regex looks for a newline followed immediately by [number] and replaces it with two newlines
    // We use a positive lookahead for [number] to avoid consuming it
    processed = processed.replace(/(?:\r\n|\r|\n)(?=\[\d+\])/g, '\n\n');

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
    }
};

const parser = new MarkdownParser(
    citationSchema,
    defaultMarkdownParser.tokenizer,
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
        }
    },
    defaultMarkdownSerializer.marks
);

export function parseMarkdownToProseMirror(markdown: string) {
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

    if (frontmatter && doc) {
        const fmNode = citationSchema.nodes.frontmatter.create({ rawYaml: frontmatter });
        
        // Create a new document with the frontmatter node prepended
        const nodes: any[] = [fmNode];
        doc.content.forEach(n => nodes.push(n));
        
        return citationSchema.node("doc", null, nodes);
    }

    return doc;
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


