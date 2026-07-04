import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { autoUnwrapBlocks } from '../utils/auto-unwrap'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

/** blockquote ↔ Comark `blockquote`. */
export const blockquoteSpec: NodeSpec = {
  pmName: 'blockquote',
  tags: ['blockquote'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    /* Comark autoUnwraps single-paragraph blockquotes; mirror on serialize so `> Look **here** thanks.` round-trips clean. */
    return ['blockquote', attrs, ...autoUnwrapBlocks(node.content, h)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = {
      type: 'blockquote',
      content: h.parseBlocks(children),
    }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}
