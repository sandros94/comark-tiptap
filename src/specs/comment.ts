import { mergeAttrs, splitAttrs } from '../utils/attrs'
/* Comark tuple type aliased so the Tiptap extension can keep the name `ComarkComment` (in `extensions/comment.ts`) without a merged-declaration clash. */
import type {
  ComarkComment as ComarkCommentTuple,
  ComarkElement,
  JSONContent,
  NodeSpec,
} from '../types'

const SEMANTIC_KEYS = ['text'] as const

/** comarkComment ↔ Comark comment tuple (`[null, attrs, text]`). */
export const commentSpec: NodeSpec = {
  pmName: 'comarkComment',
  /* Dispatched by `el[0] === null` rather than a tag, so the tag set is empty. */
  tags: [] as readonly string[],

  toComark(node: JSONContent): ComarkCommentTuple {
    const text = (node.attrs?.text as string | undefined) ?? ''
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return [null, attrs, text]
  },

  fromComark(el: ComarkElement): JSONContent | null {
    // Cast to the comment shape — orchestrator only routes comments here.
    const comment = el as unknown as ComarkCommentTuple
    const text = comment[2] ?? ''
    const { htmlAttrs } = splitAttrs(comment[1], SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = { text }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return { type: 'comarkComment', attrs }
  },
}
