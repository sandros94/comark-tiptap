import { mergeAttrs, splitAttrs } from '../utils/attrs'
import type { ComarkElement, JSONContent, NodeSpec } from '../types'

const SEMANTIC_KEYS = ['src', 'alt', 'title', 'width', 'height'] as const

/** image ↔ Comark `img`. */
export const imageSpec: NodeSpec = {
  pmName: 'image',
  tags: ['img'],
  context: 'inline',

  toComark(node: JSONContent): ComarkElement {
    const semantic: Record<string, unknown> = {}
    if (node.attrs?.src) semantic.src = node.attrs.src
    if (node.attrs?.alt) semantic.alt = node.attrs.alt
    if (node.attrs?.title) semantic.title = node.attrs.title
    /* Comark stores numeric attrs as strings (`{width="320"}`); normalise on output so the AST stays stable across DOM round-trips that may coerce them to numbers. */
    if (node.attrs?.width != null) semantic.width = String(node.attrs.width)
    if (node.attrs?.height != null) semantic.height = String(node.attrs.height)
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['img', attrs]
  },

  fromComark(el: ComarkElement): JSONContent {
    const { semantic, htmlAttrs } = splitAttrs(el[1], SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = {
      src: (semantic.src as string | undefined) ?? null,
      alt: (semantic.alt as string | null | undefined) ?? null,
      title: (semantic.title as string | null | undefined) ?? null,
    }
    if (semantic.width != null) attrs.width = semantic.width
    if (semantic.height != null) attrs.height = semantic.height
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return { type: 'image', attrs }
  },
}
