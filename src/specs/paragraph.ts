import { mergeAttrs, splitAttrs } from '../utils/attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

/** paragraph ↔ Comark `p`. */
export const paragraphSpec: NodeSpec = {
  pmName: 'paragraph',
  tags: ['p'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['p', attrs, ...h.serializeInlines(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = {
      type: 'paragraph',
      content: h.parseInlines(children),
    }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}
