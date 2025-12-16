import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history } from 'prosemirror-history'
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { imagePlugin, defaultSettings as imageDefaultSettings } from 'prosemirror-image-plugin'
import 'prosemirror-image-plugin/dist/styles/common.css'
import 'prosemirror-image-plugin/dist/styles/sideResize.css'

import { citationSchema, insertCitation } from '../lib/prosemirror-schema'
import { createCitationPlugin } from '../lib/citation-plugin'
import { parseMarkdownToProseMirror, convertProseMirrorToMarkdown } from '../services/markdownService'
import { useDiffTransition } from '../hooks/useDiffTransition'
import { mapTextRangeToDocRange } from '@shared/services/FrontendPositionResolver'
import { createHighlightPlugin, embeddableHighlightPluginKey } from './highlightPlugin'
import type { EmbeddableEditorProps } from './types'
import { Button } from '@/components/ui/button'
import ImageEditDialog from '../components/ImageEditDialog'

function toDocNode(markdown: string) {
  try {
    const parsed = parseMarkdownToProseMirror(markdown || '')
    // parsed may already be a PMNode or a JSON-like structure
    if (parsed && typeof (parsed as any).type?.name === 'string') {
      return parsed as any
    }
    if (parsed && typeof (parsed as any).type === 'string') {
      const jsonDoc = (parsed as any).type === 'doc' ? parsed : { type: 'doc', content: [parsed] }
      return citationSchema.nodeFromJSON(jsonDoc)
    }
  } catch (error) {
    console.error('Failed to parse markdown, falling back to empty doc', error)
  }
  return citationSchema.node('doc', null, [citationSchema.node('paragraph')])
}

function toMarkdown(doc: any) {
  try {
    const json = typeof doc?.toJSON === 'function' ? doc.toJSON() : doc
    return convertProseMirrorToMarkdown(json)
  } catch (error) {
    console.error('Failed to serialize markdown', error)
    return ''
  }
}

export function EmbeddableEditor(props: EmbeddableEditorProps) {
  const {
    valueMarkdown,
    onChangeMarkdown,
    editable = true,
    highlights = [],
    enableDiffs = true,
    enableImages = true,
    enableChatSidebar = false,
    ai,
    references,
    chatSidebar,
    onReady,
    onError,
    onSelectionChange
  } = props

  const editorRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const highlightsRef = useRef(highlights)
  const lastMarkdownRef = useRef<string>(valueMarkdown || '')
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imageEditState, setImageEditState] = useState<{ pos: number; attrs: any } | null>(null)
  const documentId = useMemo(() => props.documentId || `embeddable-${Date.now()}`, [props.documentId])

  const { showDiffTransition, clearDiffTransition } = useDiffTransition(() => viewRef.current, { mode: 'simple', duration: 1200 })

  useEffect(() => {
    highlightsRef.current = highlights
    if (viewRef.current) {
      const tr = viewRef.current.state.tr.setMeta(embeddableHighlightPluginKey, { refresh: true }).setMeta('addToHistory', false)
      viewRef.current.dispatch(tr)
    }
  }, [highlights])

  const applyTextChange = useCallback((range: { start: number; end: number }, newText: string) => {
    const view = viewRef.current
    if (!view) return
    const mapped = mapTextRangeToDocRange(view.state.doc, range.start, range.end - range.start)
    if (!mapped) return
    const { state, dispatch } = view
    const oldText = state.doc.textBetween(mapped.start, mapped.end, '\n')
    const tr = state.tr.replaceWith(mapped.start, mapped.end, state.schema.text(newText || ''))
    dispatch(tr)
    if (enableDiffs) {
      showDiffTransition(oldText, newText, { start: mapped.start, end: mapped.start + Math.max(1, newText.length) })
    }
  }, [enableDiffs, showDiffTransition])

  const getDocumentText = useCallback(() => {
    const view = viewRef.current
    if (!view) return ''
    return view.state.doc.textContent || ''
  }, [])

  useEffect(() => {
    if (!editorRef.current) return
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const docNode = toDocNode(valueMarkdown || '')

    const filteredBaseKeymap = { ...baseKeymap }
    delete filteredBaseKeymap['Mod-z']
    delete filteredBaseKeymap['Mod-Shift-z']

    const customKeymap = keymap({
      'Mod-b': (state, dispatch) => { return baseKeymap['Mod-b']?.(state, dispatch) ?? false },
      'Mod-i': (state, dispatch) => { return baseKeymap['Mod-i']?.(state, dispatch) ?? false },
      'Shift-Ctrl-8': splitListItem(citationSchema.nodes.list_item),
      'Shift-Ctrl-9': sinkListItem(citationSchema.nodes.list_item),
      'Mod-[': liftListItem(citationSchema.nodes.list_item),
      'Mod-]': sinkListItem(citationSchema.nodes.list_item)
    })

    const diffHighlightPlugin = new Plugin({
      state: {
        init() { return null },
        apply(tr) {
          return tr.getMeta('diffHighlight') || tr.getMeta('clearDiffHighlight') || null
        }
      },
      props: {
        decorations(state) {
          const meta = this.getState(state)
          if (!meta || !meta.start) return null
          const { Decoration, DecorationSet } = require('prosemirror-view') as typeof import('prosemirror-view')
          const s = Math.max(1, Math.min(meta.start, state.doc.content.size - 1))
          const e = Math.max(s + 1, Math.min(meta.end, state.doc.content.size))
          const dec = Decoration.inline(s, e, { class: 'ca-highlight' }, { inclusiveStart: false, inclusiveEnd: false })
          return DecorationSet.create(state.doc, [dec])
        }
      }
    })

    const state = EditorState.create({
      doc: docNode,
      schema: citationSchema,
      plugins: [
        history(),
        customKeymap,
        keymap(filteredBaseKeymap),
        createHighlightPlugin(() => highlightsRef.current || []),
        createCitationPlugin(documentId, { documentId, style: 'apa', inlineFormat: 'numbered' } as any),
        enableDiffs ? diffHighlightPlugin : null,
        enableImages ? imagePlugin({ ...imageDefaultSettings }) : null
      ].filter(Boolean) as Plugin[]
    })

    const dispatchTransaction = (tr: any) => {
      const view = viewRef.current
      if (!view) return
      const newState = view.state.apply(tr)
      view.updateState(newState)

      if (tr.selectionSet && onSelectionChange) {
        const { from, to } = newState.selection
        if (from === to) {
          onSelectionChange(null)
        } else {
          onSelectionChange({ start: from, end: to })
        }
      }

      if (tr.docChanged && onChangeMarkdown) {
        const md = toMarkdown(newState.doc)
        lastMarkdownRef.current = md
        onChangeMarkdown(md, { docJSON: newState.doc.toJSON() })
      }

      if (tr.getMeta('clearDiffHighlight') && enableDiffs) {
        clearDiffTransition()
      }
    }

    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction,
      editable: () => editable,
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement
        if (target.classList.contains('citation')) {
          const referenceId = target.getAttribute('data-reference-id')
          if (referenceId && references?.onCitationClick) {
            references.onCitationClick(referenceId)
            return true
          }
        }
        if (target.tagName === 'IMG') {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (coords) {
            const node = view.state.doc.nodeAt(coords.pos)
            if (node && node.type.name === 'image') {
              setImageEditState({ pos: coords.pos, attrs: node.attrs })
              setShowImageDialog(true)
              return true
            }
          }
        }
        return false
      }
    })

    viewRef.current = view
    lastMarkdownRef.current = valueMarkdown || toMarkdown(docNode)

    onReady?.({
      applyTextChange,
      getDocumentText,
      showDiff: ({ oldText, newText, range }) => {
        if (!enableDiffs) return
        showDiffTransition(oldText, newText, range)
      }
    })

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [
    valueMarkdown,
    documentId,
    editable,
    enableDiffs,
    enableImages,
    applyTextChange,
    getDocumentText,
    showDiffTransition,
    clearDiffTransition,
    references,
    onChangeMarkdown,
    onReady,
    onSelectionChange
  ])

  useEffect(() => {
    if (!viewRef.current) return
    if (valueMarkdown === lastMarkdownRef.current) return
    try {
      const node = toDocNode(valueMarkdown || '')
      const tr = viewRef.current.state.tr.replaceWith(0, viewRef.current.state.doc.content.size, node.content)
      tr.setMeta('fromExternalMarkdown', true).setMeta('addToHistory', false)
      viewRef.current.dispatch(tr)
      lastMarkdownRef.current = valueMarkdown || ''
    } catch (error) {
      console.error('Failed to apply external markdown change', error)
      onError?.(error as Error)
    }
  }, [valueMarkdown, onError])

  const handleAIReplace = useCallback(async () => {
    if (!ai?.runAction || !viewRef.current) return
    const view = viewRef.current
    const { state } = view
    const { from, to } = state.selection
    if (from === to) return
    const selectedText = state.doc.textBetween(from, to, '\n')
    const payload = {
      text: selectedText,
      markdown: lastMarkdownRef.current,
      selection: { start: from, end: to },
      documentId
    }
    try {
      const result = await ai.runAction(payload)
      const replacementText = result?.replacementText ?? ''
      const targetRange = result?.range
      const docRange = targetRange
        ? mapTextRangeToDocRange(state.doc, targetRange.start, targetRange.end - targetRange.start)
        : { start: from, end: to }
      if (!docRange) return
      const oldText = state.doc.textBetween(docRange.start, docRange.end, '\n')
      const tr = state.tr.replaceWith(docRange.start, docRange.end, state.schema.text(replacementText))
      view.dispatch(tr)
      if (enableDiffs) {
        showDiffTransition(oldText, replacementText, { start: docRange.start, end: docRange.start + Math.max(1, replacementText.length) })
      }
    } catch (error) {
      console.error('AI replace failed', error)
      onError?.(error as Error)
    }
  }, [ai, documentId, enableDiffs, showDiffTransition, onError])

  const handleInsertCitation = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const { state, dispatch } = view
    insertCitation(state, dispatch, 'reference-id', '[citation]', documentId)
    references?.onCreateReference?.()
  }, [documentId, references])

  const handleImageSave = useCallback((attrs: any) => {
    if (!viewRef.current || !imageEditState) return
    const { state, dispatch } = viewRef.current
    const tr = state.tr.setNodeMarkup(imageEditState.pos, undefined, { ...imageEditState.attrs, ...attrs })
    dispatch(tr)
    setShowImageDialog(false)
    setImageEditState(null)
  }, [imageEditState])

  const handleImageRemove = useCallback(() => {
    if (!viewRef.current || !imageEditState) return
    const { state, dispatch } = viewRef.current
    const node = state.doc.nodeAt(imageEditState.pos)
    if (!node) return
    const tr = state.tr.delete(imageEditState.pos, imageEditState.pos + node.nodeSize)
    dispatch(tr)
    setShowImageDialog(false)
    setImageEditState(null)
  }, [imageEditState])

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 border rounded-md p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleAIReplace()} disabled={!ai?.runAction}>AI Replace</Button>
          <Button size="sm" variant="outline" onClick={handleInsertCitation}>Add Citation</Button>
          {enableImages && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!viewRef.current) return
                const fileInput = document.createElement('input')
                fileInput.type = 'file'
                fileInput.accept = 'image/*'
                fileInput.onchange = async (event: Event) => {
                  const file = (event.target as HTMLInputElement).files?.[0]
                  if (!file) return
                  let src = ''
                  try {
                    if (props.ai?.onOpenSidebar) {
                      // allow host to open sidebar while uploading if they want
                      props.ai.onOpenSidebar()
                    }
                    if (props.onImageUpload) {
                      src = await props.onImageUpload(file)
                    } else {
                      src = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(reader.result as string)
                        reader.onerror = () => reject(reader.error)
                        reader.readAsDataURL(file)
                      })
                    }
                    const { state, dispatch } = viewRef.current!
                    const { schema } = state
                    const imageNode = schema.nodes.image.create({ src, alt: file.name })
                    const tr = state.tr.replaceSelectionWith(imageNode)
                    dispatch(tr)
                  } catch (error) {
                    console.error('Image upload failed', error)
                    onError?.(error as Error)
                  }
                }
                fileInput.click()
              }}
            >
              Insert Image
            </Button>
          )}
        </div>
        <div ref={editorRef} className="border rounded-md p-3 min-h-[320px] prose-sm prose" />
      </div>
      {enableChatSidebar && (
        <aside className="w-80 border rounded-md p-3 space-y-3">
          {chatSidebar?.header}
          <div className="flex-1 min-h-[200px] overflow-auto">
            {chatSidebar?.body || (
              <p className="text-sm text-muted-foreground">Provide chatSidebar.body to render AI chat.</p>
            )}
          </div>
          {chatSidebar?.footer}
        </aside>
      )}
      {showImageDialog && imageEditState && (
        <ImageEditDialog
          isOpen={showImageDialog}
          onClose={() => {
            setShowImageDialog(false)
            setImageEditState(null)
          }}
          initialAttrs={imageEditState.attrs}
          isEditMode
          onSave={(settings) => handleImageSave(settings)}
          onRemove={handleImageRemove}
        />
      )}
    </div>
  )
}

export default EmbeddableEditor



