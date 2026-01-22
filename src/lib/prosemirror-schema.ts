import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

const nodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  .update("paragraph", {
    content: "inline*",
    group: "block",
    attrs: { class: { default: null } },
    parseDOM: [{ tag: "p", getAttrs: (dom: any) => ({ class: dom.className || null }) }],
    toDOM: (node: any) => ["p", node.attrs.class ? { class: node.attrs.class } : {}, 0]
  })
  .update("blockquote", {
    content: "block+",
    group: "block",
    defining: true,
    attrs: { class: { default: null } },
    parseDOM: [{ tag: "blockquote", getAttrs: (dom: any) => ({ class: dom.className || null }) }],
    toDOM: (node: any) => ["blockquote", node.attrs.class ? { class: node.attrs.class } : {}, 0]
  })
  .update("heading", {
    attrs: { level: { default: 1 }, class: { default: null } },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", getAttrs: (dom: any) => ({ level: 1, class: dom.className || null }) },
      { tag: "h2", getAttrs: (dom: any) => ({ level: 2, class: dom.className || null }) },
      { tag: "h3", getAttrs: (dom: any) => ({ level: 3, class: dom.className || null }) },
      { tag: "h4", getAttrs: (dom: any) => ({ level: 4, class: dom.className || null }) },
      { tag: "h5", getAttrs: (dom: any) => ({ level: 5, class: dom.className || null }) },
      { tag: "h6", getAttrs: (dom: any) => ({ level: 6, class: dom.className || null }) }
    ],
    toDOM: (node: any) => ["h" + node.attrs.level, node.attrs.class ? { class: node.attrs.class } : {}, 0]
  })
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
    attrs: { class: { default: null } },
    parseDOM: [{ tag: "table", getAttrs: (dom: any) => ({ class: dom.className || null }) }],
    toDOM: (node: any) => ["table", node.attrs.class ? { class: node.attrs.class } : {}, 0]
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
      align: { default: null },
      class: { default: null }
    },
    parseDOM: [{
      tag: "td",
      getAttrs: (dom: any) => ({ 
        align: dom.getAttribute("data-align") || dom.style?.textAlign || null,
        class: dom.className || null
      })
    }],
    toDOM: (node: any) => {
      const attrs: any = {}
      if (node.attrs.align) {
        attrs["data-align"] = node.attrs.align
        attrs.style = `text-align: ${node.attrs.align};`
      }
      if (node.attrs.class) {
        attrs.class = node.attrs.class
      }
      return ["td", attrs, 0]
    }
  })
  .addToEnd("table_header", {
    content: "inline*",
    attrs: {
      align: { default: null },
      class: { default: null }
    },
    parseDOM: [{
      tag: "th",
      getAttrs: (dom: any) => ({ 
        align: dom.getAttribute("data-align") || dom.style?.textAlign || null,
        class: dom.className || null
      })
    }],
    toDOM: (node: any) => {
      const attrs: any = {}
      if (node.attrs.align) {
        attrs["data-align"] = node.attrs.align
        attrs.style = `text-align: ${node.attrs.align};`
      }
      if (node.attrs.class) {
        attrs.class = node.attrs.class
      }
      return ["th", attrs, 0]
    }
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
    align: { default: null },
    class: { default: null }
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
        align: dom.getAttribute("data-align"),
        class: dom.className || null
      })
    }
  ],
  toDOM: (node: any) => {
    const attrs: Record<string, string | number | null | undefined> = {
      src: node.attrs.src,
      alt: node.attrs.alt,
      title: node.attrs.title,
      class: node.attrs.class
    }
    if (node.attrs.width != null) attrs.width = node.attrs.width
    if (node.attrs.height != null) attrs.height = node.attrs.height
    if (node.attrs.maxWidth != null) attrs["data-max-width"] = node.attrs.maxWidth
    if (node.attrs.align != null) attrs["data-align"] = node.attrs.align
    return ["img", attrs]
  }
});

const marks = basicSchema.spec.marks.addToEnd("span", {
  attrs: { class: { default: null } },
  parseDOM: [{ tag: "span", getAttrs: (dom: any) => ({ class: dom.className || null }) }],
  toDOM: (mark: any) => ["span", { class: mark.attrs.class }, 0]
});

export const citationSchema = new Schema({
  nodes,
  marks
});

export const insertCitation = (state: any, dispatch: any, id: string, label: string, docId: string) => {
    if (dispatch) {
        dispatch(state.tr.insertText(`[${label}]`));
    }
}
