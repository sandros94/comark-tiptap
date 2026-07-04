import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Tiptap node for Comark slot templates (`::template[name]`). The
 * Comark serializer handles the `name` and child round-trip; this
 * extension is the schema slot. `htmlAttrs` is provided globally by
 * `ComarkAttrs`.
 */
export const ComarkTemplate = Node.create({
  name: 'comarkTemplate',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-slot'),
        renderHTML: (attrs) => (attrs.name ? { 'data-slot': attrs.name as string } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-comark-template]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-comark-template': '' }), 0]
  },
})
