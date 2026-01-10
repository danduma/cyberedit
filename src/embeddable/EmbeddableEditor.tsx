import * as React from 'react'
import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { EditorState, Plugin, Transaction } from 'prosemirror-state'
import { Transform } from 'prosemirror-transform'
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'
import { history, undo, redo } from 'prosemirror-history'
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list'
import { imagePlugin, defaultSettings as imageDefaultSettings, startImageUpload } from 'prosemirror-image-plugin'
import 'prosemirror-image-plugin/dist/styles/common.css'
import 'prosemirror-image-plugin/dist/styles/withResize.css'
import './theme.css'

import { Bold, Italic, List, ListOrdered, Quote, Redo, Undo, Sparkles, Image as ImageIcon, BookOpen, MoreVertical } from 'lucide-react'

import { citationSchema, insertCitation } from '../lib/prosemirror-schema'
import { createCitationPlugin } from '../lib/citation-plugin'
import { parseMarkdownToProseMirror, convertProseMirrorToMarkdown, resolveImageUrl } from '../services/markdownService'
import { useDiffTransition } from '../hooks/useDiffTransition'
import { mapTextRangeToDocRange } from '../utils/positionResolver'
import { createHighlightPlugin, embeddableHighlightPluginKey } from './highlightPlugin'
// Import NodeView for frontmatter
import { FrontmatterNodeView } from './FrontmatterNodeView'
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
    return convertProseMirrorToMarkdown(doc)
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
    customToolbarButtons,
    onReady,
    onError,
    onSelectionChange,
    ticketId,
    apiBaseUrl
  } = props

  const editorRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const highlightsRef = useRef(highlights)
  const onChangeMarkdownRef = useRef(onChangeMarkdown)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const referencesRef = useRef(references)
  const lastMarkdownRef = useRef<string>(valueMarkdown || '')
  const pendingSerializeTimerRef = useRef<number | null>(null)
  const pendingSerializeIdleRef = useRef<number | null>(null)
  const serializeScheduledRef = useRef(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imageEditState, setImageEditState] = useState<{ pos: number; attrs: any } | null>(null)
  const documentId = useMemo(() => props.documentId || `embeddable-${Date.now()}`, [props.documentId])

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  
  const { showDiffTransition, clearDiffTransition } = useDiffTransition(() => viewRef.current, { mode: 'simple', duration: 1200 })

  const imagePluginSettings = useMemo(() => {
    return {
      ...imageDefaultSettings,
      hasTitle: false,
      isBlock: false,
      createOverlay: () => undefined,
      uploadFile: async (file: File) => {
        if (props.onImageUpload) {
          return await props.onImageUpload(file)
        }
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
      }
    }
  }, [props.onImageUpload])

  useEffect(() => {
    onChangeMarkdownRef.current = onChangeMarkdown
  }, [onChangeMarkdown])

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    referencesRef.current = references
  }, [references])

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

  // Get API base URL dynamically
  const getApiBaseUrl = useCallback(() => {
    if (apiBaseUrl) return apiBaseUrl

    // Fallback: construct API URL similar to api.ts
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
      const isDevFrontend = isLocalHost && ['3000', '3001', '5173', '4173'].includes(port || '')
      if (isDevFrontend) {
        return `${protocol}//localhost:8000/api`
      }
      return `${protocol}//${hostname}${port ? `:${port}` : ''}/api`
    }

    return '/api'
  }, [apiBaseUrl])

  // Function to process image nodes and resolve URLs in a document
  const processImageNodesInDoc = useCallback((doc: any) => {
    if (!doc || !doc.descendants) return doc

    const baseUrl = getApiBaseUrl()
    const tr = new Transform(doc)
    let modified = false

    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'image' && node.attrs.src) {
        const resolvedSrc = resolveImageUrl(node.attrs.src, ticketId, baseUrl)
        if (resolvedSrc !== node.attrs.src) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            src: resolvedSrc
          })
          modified = true
        }
      }
    })

    return modified ? tr.doc : doc
  }, [ticketId, getApiBaseUrl])

  // Function to process image nodes and resolve URLs (for post-view creation updates)
  const processImageNodes = useCallback((doc: any) => {
    if (!doc || !doc.descendants) return doc

    const baseUrl = getApiBaseUrl()
    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'image' && node.attrs.src) {
        const resolvedSrc = resolveImageUrl(node.attrs.src, ticketId, baseUrl)
        if (resolvedSrc !== node.attrs.src && viewRef.current) {
          // Update the image src if it was resolved
          const tr = viewRef.current.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            src: resolvedSrc
          })
          tr.setMeta('addToHistory', false)
          viewRef.current.dispatch(tr)
        }
      }
    })

    return doc
  }, [ticketId, getApiBaseUrl])

  useEffect(() => {
    if (!editorRef.current) return
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    const docNode = toDocNode(valueMarkdown || '')
    // Process image URLs after parsing
    const processedDocNode = processImageNodesInDoc(docNode)

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
          const s = Math.max(1, Math.min(meta.start, state.doc.content.size - 1))
          const e = Math.max(s + 1, Math.min(meta.end, state.doc.content.size))
          const dec = Decoration.inline(s, e, { class: 'ca-highlight' }, { inclusiveStart: false, inclusiveEnd: false })
          return DecorationSet.create(state.doc, [dec])
        }
      }
    })

    const state = EditorState.create({
      doc: processedDocNode,
      schema: citationSchema,
      plugins: [
        history(),
        customKeymap,
        keymap(filteredBaseKeymap),
        createHighlightPlugin(() => highlightsRef.current || []),
        createCitationPlugin(documentId, { documentId, style: 'apa', inlineFormat: 'numbered' } as any),
        enableDiffs ? diffHighlightPlugin : null,
        enableImages ? imagePlugin(imagePluginSettings) : null
      ].filter(Boolean) as Plugin[]
    })

    const scheduleMarkdownSerialization = () => {
      if (serializeScheduledRef.current) return
      serializeScheduledRef.current = true

      const run = () => {
        serializeScheduledRef.current = false
        const view = viewRef.current
        if (!view) return
        const changeHandler = onChangeMarkdownRef.current
        if (!changeHandler) return
        const md = toMarkdown(view.state.doc)
        lastMarkdownRef.current = md
        changeHandler(md, { docJSON: view.state.doc.toJSON() })
      }

      // Prefer idle time serialization to avoid blocking UI on large docs
      if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
        pendingSerializeIdleRef.current = (window as any).requestIdleCallback(run, { timeout: 250 })
      } else {
        pendingSerializeTimerRef.current = window.setTimeout(run, 0)
      }
    }

    const dispatchTransaction = (tr: any) => {
      const view = viewRef.current
      if (!view) return
      const newState = view.state.apply(tr)
      view.updateState(newState)

      setCanUndo(undo(view.state))
      setCanRedo(redo(view.state))

      const selectionHandler = onSelectionChangeRef.current
      if (tr.selectionSet && selectionHandler) {
        const { from, to } = newState.selection
        if (from === to) {
          selectionHandler(null)
        } else {
          selectionHandler({ start: from, end: to })
        }
      }

      const changeHandler = onChangeMarkdownRef.current
      if (tr.docChanged && changeHandler) {
        // Avoid feedback loops: external markdown updates should not immediately re-emit markdown
        if (!tr.getMeta('fromExternalMarkdown')) {
          scheduleMarkdownSerialization()
        }
      }

      if (tr.getMeta('clearDiffHighlight') && enableDiffs) {
        clearDiffTransition()
      }
    }

    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction,
      nodeViews: {
        frontmatter: (node, view, getPos) => new FrontmatterNodeView(node, view, getPos as () => number | undefined)
      },
      editable: () => editable,
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement
        if (target.classList.contains('citation')) {
          const referenceId = target.getAttribute('data-reference-id')
          const refHandlers = referencesRef.current
          if (referenceId && refHandlers?.onCitationClick) {
            refHandlers.onCitationClick(referenceId)
            return true
          }
        }
        if (target.closest?.('.imageResizeBoxControl, .imageResizeBox, .imageResizeBoxWrapper')) {
          return false
        }
        const imageEl =
          target.tagName === 'IMG'
            ? (target as HTMLImageElement)
            : (target.closest?.('img') as HTMLImageElement | null)
        if (imageEl) {
          const clickPos = view.posAtDOM(imageEl, 0)
          let node = view.state.doc.nodeAt(clickPos)
          let imagePos = clickPos
          if (!node || node.type.name !== 'image') {
            const $pos = view.state.doc.resolve(clickPos)
            if ($pos.nodeAfter?.type.name === 'image') {
              node = $pos.nodeAfter
              imagePos = clickPos
            } else if ($pos.nodeBefore?.type.name === 'image') {
              node = $pos.nodeBefore
              imagePos = clickPos - $pos.nodeBefore.nodeSize
            }
          }
          if (node && node.type.name === 'image') {
            setImageEditState({ pos: imagePos, attrs: node.attrs })
            setShowImageDialog(true)
            return true
          }
        }
        return false
      }
    })

    viewRef.current = view
    // Avoid init-time round-trip serialization (can be expensive on large documents).
    // Treat the provided markdown value as the source of truth.
    lastMarkdownRef.current = valueMarkdown || ''

    onReadyRef.current?.({
      applyTextChange,
      getDocumentText,
      showDiff: ({ oldText, newText, range }) => {
        if (!enableDiffs) return
        showDiffTransition(oldText, newText, range)
      }
    })

    return () => {
      // cancel any pending serialization work
      if (pendingSerializeIdleRef.current !== null && typeof window !== 'undefined' && typeof (window as any).cancelIdleCallback === 'function') {
        ;(window as any).cancelIdleCallback(pendingSerializeIdleRef.current)
      }
      pendingSerializeIdleRef.current = null
      if (pendingSerializeTimerRef.current !== null) {
        window.clearTimeout(pendingSerializeTimerRef.current)
      }
      pendingSerializeTimerRef.current = null
      serializeScheduledRef.current = false
      view.destroy()
      viewRef.current = null
    }
  }, [
    documentId,
    editable,
    enableDiffs,
    enableImages,
    imagePluginSettings,
    applyTextChange,
    getDocumentText,
    showDiffTransition,
    clearDiffTransition,
    ticketId,
    processImageNodesInDoc,
    getApiBaseUrl
  ])

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showOverflowMenu) {
        const target = event.target as Element
        if (!target.closest('.overflow-menu-container')) {
          setShowOverflowMenu(false)
        }
      }
    }

    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOverflowMenu])

  useEffect(() => {
    if (!viewRef.current) return
    const newValue = valueMarkdown || ''
    if (newValue === lastMarkdownRef.current) return
    
    try {
      // Update the ref immediately to prevent infinite loops from synchronous re-renders
      // logic: if we are processing this update, we consider it "handled" even if we bail out later
      lastMarkdownRef.current = newValue
      
      const node = toDocNode(newValue)
      const processedNode = processImageNodesInDoc(node)
      
      // Check for structural equality to avoid unnecessary updates and loops
      if (!processedNode.eq(viewRef.current.state.doc)) {
        const tr = viewRef.current.state.tr.replaceWith(0, viewRef.current.state.doc.content.size, processedNode.content)
        tr.setMeta('fromExternalMarkdown', true).setMeta('addToHistory', false)
        viewRef.current.dispatch(tr)
      }
    } catch (error) {
      console.error('Failed to apply external markdown change', error)
      onErrorRef.current?.(error as Error)
    }
  }, [valueMarkdown, ticketId, processImageNodesInDoc, getApiBaseUrl])

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
    <div className="flex flex-col h-full">
      {/* Toolbar - responsive with overflow menu on mobile */}
      <div className="border-b pb-0 px-1">
        {/* Desktop toolbar - all buttons visible */}
        <div className="hidden md:flex items-center gap-1 flex-wrap p-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
            if (viewRef.current) {
              undo(viewRef.current.state, viewRef.current.dispatch)
              viewRef.current.focus()
            }
          }} disabled={!canUndo}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               redo(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }} disabled={!canRedo}>
            <Redo className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               toggleMark(citationSchema.marks.strong)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               toggleMark(citationSchema.marks.em)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
           <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               wrapInList(citationSchema.nodes.bullet_list)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <List className="h-4 w-4" />
          </Button>
           <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               wrapInList(citationSchema.nodes.ordered_list)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               wrapIn(citationSchema.nodes.blockquote)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Quote className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleAIReplace()} disabled={!ai?.runAction}>
            <Sparkles className="h-4 w-4 text-purple-500" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleInsertCitation}>
            <BookOpen className="h-4 w-4" />
          </Button>
          {enableImages && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                if (!viewRef.current) return
                const fileInput = document.createElement('input')
                fileInput.type = 'file'
                fileInput.accept = 'image/*'
                fileInput.onchange = async (event: Event) => {
                  const file = (event.target as HTMLInputElement).files?.[0]
                  if (!file) return
                  try {
                    if (props.ai?.onOpenSidebar) {
                      // allow host to open sidebar while uploading if they want
                      props.ai.onOpenSidebar()
                    }
                    startImageUpload(viewRef.current!, file, file.name, imagePluginSettings, viewRef.current!.state.schema)
                  } catch (error) {
                    console.error('Image upload failed', error)
                    onError?.(error as Error)
                  }
                }
                fileInput.click()
              }}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          {customToolbarButtons}
        </div>

        {/* Mobile toolbar - essential buttons only, with overflow menu */}
        <div className="flex md:hidden items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
            if (viewRef.current) {
              undo(viewRef.current.state, viewRef.current.dispatch)
              viewRef.current.focus()
            }
          }} disabled={!canUndo}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               redo(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }} disabled={!canRedo}>
            <Redo className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               toggleMark(citationSchema.marks.strong)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               toggleMark(citationSchema.marks.em)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Italic className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               wrapInList(citationSchema.nodes.bullet_list)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <List className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
             if (viewRef.current) {
               wrapIn(citationSchema.nodes.blockquote)(viewRef.current.state, viewRef.current.dispatch)
               viewRef.current.focus()
             }
          }}>
            <Quote className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          {customToolbarButtons}

          {/* Overflow menu button */}
          <div className="relative ml-auto overflow-menu-container">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {/* Overflow dropdown menu */}
            {showOverflowMenu && (
              <div className="absolute top-full right-0 mt-1 bg-background border rounded-md shadow-lg z-50 min-w-[160px] overflow-menu-container">
                <div className="p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 px-2"
                    onClick={() => {
                      if (viewRef.current) {
                        wrapInList(citationSchema.nodes.ordered_list)(viewRef.current.state, viewRef.current.dispatch)
                        viewRef.current.focus()
                      }
                      setShowOverflowMenu(false)
                    }}
                  >
                    <ListOrdered className="h-4 w-4 mr-2" />
                    Ordered List
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 px-2"
                    onClick={() => {
                      handleAIReplace()
                      setShowOverflowMenu(false)
                    }}
                    disabled={!ai?.runAction}
                  >
                    <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                    AI Assist
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 px-2"
                    onClick={() => {
                      handleInsertCitation()
                      setShowOverflowMenu(false)
                    }}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Citation
                  </Button>
                  {enableImages && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start h-8 px-2"
                      onClick={() => {
                        if (!viewRef.current) return
                        const fileInput = document.createElement('input')
                        fileInput.type = 'file'
                        fileInput.accept = 'image/*'
                        fileInput.onchange = async (event: Event) => {
                          const file = (event.target as HTMLInputElement).files?.[0]
                          if (!file) return
                          try {
                            if (props.ai?.onOpenSidebar) {
                              // allow host to open sidebar while uploading if they want
                              props.ai.onOpenSidebar()
                            }
                            startImageUpload(viewRef.current!, file, file.name, imagePluginSettings, viewRef.current!.state.schema)
                          } catch (error) {
                            console.error('Image upload failed', error)
                            onError?.(error as Error)
                          }
                        }
                        fileInput.click()
                        setShowOverflowMenu(false)
                      }}
                    >
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Image
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 p-0 space-y-3 overflow-auto flex flex-col">
           <div ref={editorRef} className="min-h-[320px] prose-sm prose max-w-none flex-1" />
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
      </div>
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
