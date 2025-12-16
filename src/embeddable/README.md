# Embeddable Editor (React)

Minimal ProseMirror-based editor you can embed in a host React app. It preserves markdown roundtrip, citations, inline highlights, diff animations, AI-driven replacements, image editing, and an optional chat sidebar.

## Install/use
```tsx
import { EmbeddableEditor } from '@/embeddable'

<EmbeddableEditor
  valueMarkdown={markdown}
  onChangeMarkdown={setMarkdown}
  highlights={[{ id: 'h1', start: 5, end: 20 }]}
  ai={{ runAction: async ({ text }) => ({ replacementText: `${text} (updated)` }) }}
  references={{ onCitationClick: console.log, onCreateReference: console.log }}
  enableChatSidebar
  chatSidebar={{ body: <MyChat /> }}
/>
```

## Key props
- `valueMarkdown` / `onChangeMarkdown`: controlled markdown text.
- `highlights`: `{ start, end, className?, label? }[]` renders inline decorations.
- `ai.runAction`: async hook for AI replace; called with `{ text, markdown, selection }`.
- `onReady`: exposes `applyTextChange`, `getDocumentText`, `showDiff`.
- `onImageUpload`: return a URL for inserted images; defaults to data URL.
- `references`: `onCitationClick`, `onCreateReference` callbacks.
- `enableDiffs`, `enableImages`, `enableChatSidebar`: feature toggles.

## Demo
See `src/embeddable/Demo.tsx` for a runnable example inside the app shell.



