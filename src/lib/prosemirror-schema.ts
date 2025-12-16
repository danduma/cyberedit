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
  .addToEnd("image", {
  inline: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null }
  },
  group: "inline",
  draggable: true,
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom: any) => ({
        src: dom.getAttribute("src"),
        alt: dom.getAttribute("alt"),
        title: dom.getAttribute("title")
      })
    }
  ],
  toDOM: (node: any) => ["img", node.attrs]
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
