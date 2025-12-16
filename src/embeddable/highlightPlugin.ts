import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export interface HighlightRange {
  id?: string
  start: number
  end: number
  className?: string
  label?: string
}

export const embeddableHighlightPluginKey = new PluginKey('embeddable-highlights')

export function createHighlightPlugin(getHighlights: () => HighlightRange[]) {
  return new Plugin({
    key: embeddableHighlightPluginKey,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, decorationSet) {
        const mapped = decorationSet.map(tr.mapping, tr.doc)
        if (tr.getMeta(embeddableHighlightPluginKey) || tr.docChanged) {
          return buildDecorations(tr.doc, getHighlights())
        }
        return mapped
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)
      }
    }
  })
}

function buildDecorations(doc: any, highlights: HighlightRange[]): DecorationSet {
  if (!highlights || highlights.length === 0) {
    return DecorationSet.empty
  }

  const docSize = doc.content.size
  const decorations: Decoration[] = []

  highlights.forEach((highlight) => {
    const start = Math.max(1, Math.min(highlight.start, docSize - 1))
    const end = Math.max(start + 1, Math.min(highlight.end, docSize))
    if (end <= start) return

    decorations.push(
      Decoration.inline(
        start,
        end,
        {
          class: highlight.className || 'embeddable-highlight',
          'data-highlight-id': highlight.id || undefined,
          title: highlight.label || undefined
        },
        { inclusiveStart: false, inclusiveEnd: false }
      )
    )
  })

  return DecorationSet.create(doc, decorations)
}



