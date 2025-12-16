import { useMemo, useState } from 'react'
import EmbeddableEditor from './EmbeddableEditor'
import type { EmbeddableHighlight } from './types'

const sampleMarkdown = `# Embeddable Editor Demo

This is a **WYSIWYG** markdown editor with citations like <CITATION_1>.

- Inline highlights
- Diff animations
- AI replacement hook

[CITATIONS]
1. Example Reference (ref: ref-1)
`

export function EmbeddableEditorDemo() {
  const [markdown, setMarkdown] = useState(sampleMarkdown)

  const highlights = useMemo<EmbeddableHighlight[]>(() => [
    { id: 'intro', start: 5, end: 26, label: 'Intro' }
  ], [])

  return (
    <EmbeddableEditor
      valueMarkdown={markdown}
      onChangeMarkdown={setMarkdown}
      highlights={highlights}
      enableChatSidebar
      ai={{
        runAction: async ({ text }) => ({
          replacementText: `${text} (edited by AI)`
        })
      }}
      chatSidebar={{
        header: <h3 className="text-sm font-semibold">AI Chat</h3>,
        body: <p className="text-sm text-muted-foreground">Host app can render chat here.</p>
      }}
      references={{
        onCitationClick: (id) => console.log('citation click', id),
        onCreateReference: () => console.log('create reference')
      }}
    />
  )
}

export default EmbeddableEditorDemo



