import { ReactNode } from 'react'

export interface EmbeddableHighlight {
  id?: string
  start: number
  end: number
  className?: string
  label?: string
}

export interface EmbeddableAIHooks {
  runAction?: (payload: {
    text: string
    markdown: string
    selection: { start: number; end: number }
    documentId: string
  }) => Promise<{
    replacementText?: string
    range?: { start: number; end: number }
    markdown?: string
  }>
  fetchSuggestions?: (payload: {
    text: string
    markdown: string
    selection: { start: number; end: number }
    documentId: string
  }) => Promise<any>
  onOpenSidebar?: () => void
}

export interface EmbeddableReferenceHooks {
  onCitationClick?: (referenceId: string) => void
  onCreateReference?: () => void
}

export interface EmbeddableChatSidebarProps {
  header?: ReactNode
  footer?: ReactNode
  body?: ReactNode
}

export interface EmbeddableEditorProps {
  valueMarkdown: string
  onChangeMarkdown?: (markdown: string, ctx: { docJSON: any }) => void
  documentId?: string
  editable?: boolean
  onImageUpload?: (file: File) => Promise<string>
  highlights?: EmbeddableHighlight[]
  enableDiffs?: boolean
  enableImages?: boolean
  enableChatSidebar?: boolean
  ai?: EmbeddableAIHooks
  references?: EmbeddableReferenceHooks
  chatSidebar?: EmbeddableChatSidebarProps
  onReady?: (api: {
    applyTextChange: (range: { start: number; end: number }, newText: string) => void
    getDocumentText: () => string
    showDiff: (params: { oldText: string; newText: string; range: { start: number; end: number } }) => void
  }) => void
  onError?: (error: Error) => void
  onSelectionChange?: (range: { start: number; end: number } | null) => void
}



