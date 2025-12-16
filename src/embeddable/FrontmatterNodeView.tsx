import { Node } from 'prosemirror-model'
import { EditorView, NodeView } from 'prosemirror-view'
import { createRoot, Root } from 'react-dom/client'
import React from 'react'
import { FrontmatterEditor } from './FrontmatterEditor'

export class FrontmatterNodeView implements NodeView {
  dom: HTMLElement
  node: Node
  view: EditorView
  getPos: () => number | undefined
  root: Root

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('div')
    this.dom.classList.add('frontmatter-wrapper')
    this.dom.setAttribute('contenteditable', 'false')
    
    this.root = createRoot(this.dom)
    this.render()
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation() {
    return true
  }

  stopEvent(event: Event) {
    const target = event.target as HTMLElement
    // Stop events from propagating to ProseMirror if they are inside our inputs
    // We need to allow some events like clicks on buttons to work normally, but preventing PM from handling them as selection changes or edits is key.
    // Returning true stops PM from handling it.
    
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.closest('input') || target.closest('textarea') || target.closest('button')) {
        return true
    }
    return false
  }

  render() {
    this.root.render(
      <FrontmatterEditor
        rawYaml={this.node.attrs.rawYaml}
        onChange={(newYaml) => {
          const pos = this.getPos()
          if (typeof pos === 'number') {
             const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
                 ...this.node.attrs,
                 rawYaml: newYaml
             })
             // We don't want this to be added to history stack individually if possible?
             // Actually we do want undo support.
             this.view.dispatch(tr)
          }
        }}
      />
    )
  }

  destroy() {
    // Unmount react root
    setTimeout(() => this.root.unmount(), 0)
  }
}
