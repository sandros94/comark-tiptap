import { mergeAttrs, splitAttrs } from '../utils/attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(6, Math.max(1, Math.floor(n)))
}

/** heading ↔ Comark `h1`–`h6` (level clamped to 1–6). */
export const headingSpec: NodeSpec = {
  pmName: 'heading',
  tags: HEADING_TAGS,

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const level = clampLevel(Number(node.attrs?.level ?? 1))
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return [`h${level}`, attrs, ...h.serializeInlines(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [tag, rawAttrs, ...children] = el
    const level = clampLevel(Number(tag.slice(1)))
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const attrs: Record<string, unknown> = { level }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return {
      type: 'heading',
      attrs,
      content: h.parseInlines(children),
    }
  },
}
