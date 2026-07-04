import { mergeAttrs, splitAttrs } from '../utils/attrs'
import type { ComarkElement, JSONContent, NodeSpec } from '../types'

/** hardBreak ↔ Comark `br`. */
export const hardBreakSpec: NodeSpec = {
  pmName: 'hardBreak',
  tags: ['br'],
  context: 'inline',

  toComark(node: JSONContent): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['br', attrs]
  },

  fromComark(el: ComarkElement): JSONContent {
    const [, rawAttrs] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = { type: 'hardBreak' }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}
