import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .addToStart("frontmatter", {
    group: "block",
    atom: true,
    attrs: { rawYaml: { default: "" } },
    parseDOM: [{ 
      tag: "div[data-type=frontmatter]",
      getAttrs: (dom: any) => ({ rawYaml: dom.getAttribute("data-yaml") })
    }],
    toDOM: (node: any) => ["div", { "data-type": "frontmatter", "data-yaml": node.attrs.rawYaml }]
  })
  .addToEnd("table", {
    group: "block",
    content: "table_head? table_body",
    isolating: true,
    parseDOM: [{ tag: "table" }],
    toDOM: () => ["table", 0]
  })
  .addToEnd("table_head", {
    content: "table_row+",
    isolating: true,
    parseDOM: [{ tag: "thead" }],
    toDOM: () => ["thead", 0]
  })
  .addToEnd("table_body", {
    content: "table_row+",
    isolating: true,
    parseDOM: [{ tag: "tbody" }],
    toDOM: () => ["tbody", 0]
  })
  .addToEnd("table_row", {
    content: "(table_cell | table_header)+",
    parseDOM: [{ tag: "tr" }],
    toDOM: () => ["tr", 0]
  })
  .addToEnd("table_cell", {
    content: "inline*",
    attrs: {
      align: { default: null }
    },
    parseDOM: [{
      tag: "td",
      getAttrs: (dom: any) => ({ align: dom.getAttribute("data-align") || dom.style?.textAlign || null })
    }],
    toDOM: (node: any) => ["td", node.attrs.align ? { "data-align": node.attrs.align, style: `text-align: ${node.attrs.align};` } : {}, 0]
  })
  .addToEnd("table_header", {
    content: "inline*",
    attrs: {
      align: { default: null }
    },
    parseDOM: [{
      tag: "th",
      getAttrs: (dom: any) => ({ align: dom.getAttribute("data-align") || dom.style?.textAlign || null })
    }],
    toDOM: (node: any) => ["th", node.attrs.align ? { "data-align": node.attrs.align, style: `text-align: ${node.attrs.align};` } : {}, 0]
  })
  .addToEnd("image", {
  inline: true,
  attrs: {
    src: { default: null },
    alt: { default: null },
    title: { default: null },
    width: { default: null },
    height: { default: null },
    maxWidth: { default: null },
    align: { default: null }
  },
  group: "inline",
  atom: true,
  draggable: true,
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom: any) => ({
        src: dom.getAttribute("src"),
        alt: dom.getAttribute("alt"),
        title: dom.getAttribute("title"),
        width: dom.getAttribute("width") ? Number(dom.getAttribute("width")) : null,
        height: dom.getAttribute("height") ? Number(dom.getAttribute("height")) : null,
        maxWidth: dom.getAttribute("data-max-width") ? Number(dom.getAttribute("data-max-width")) : null,
        align: dom.getAttribute("data-align")
      })
    }
  ],
  toDOM: (node: any) => {
    const attrs: Record<string, string | number | null | undefined> = {
      src: node.attrs.src,
      alt: node.attrs.alt,
      title: node.attrs.title
    }
    if (node.attrs.width != null) attrs.width = node.attrs.width
    if (node.attrs.height != null) attrs.height = node.attrs.height
    if (node.attrs.maxWidth != null) attrs["data-max-width"] = node.attrs.maxWidth
    if (node.attrs.align != null) attrs["data-align"] = node.attrs.align
    return ["img", attrs]
  }
});

export const citationSchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
});

export const insertCitation = (state: any, dispatch: any, id: string, label: string, docId: string) => {
    if (dispatch) {
        dispatch(state.tr.insertText(`[${label}]`));
    }
}
