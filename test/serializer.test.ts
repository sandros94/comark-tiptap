import { describe, expect, it } from 'vitest'
import { boldSpec } from '../src/specs/marks'
import { paragraphSpec } from '../src/specs/paragraph'
import { comarkToPmDoc, createSerializer, pmDocToComark } from '../src/serializer'
import type { ComarkTree } from '../src/types'

const helpers = createSerializer({
  nodes: [paragraphSpec],
  marks: [boldSpec],
})

describe('createSerializer', () => {
  it('builds helpers that can round-trip a paragraph with a bold span', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, 'a ', ['strong', { class: 'k' }, 'B'], ' c']],
      frontmatter: {},
      meta: {},
    }
    const pm = comarkToPmDoc(tree, helpers)
    expect(pm).toMatchObject({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a ' },
            {
              type: 'text',
              text: 'B',
              marks: [{ type: 'bold', attrs: { htmlAttrs: { class: 'k' } } }],
            },
            { type: 'text', text: ' c' },
          ],
        },
      ],
    })

    const back = pmDocToComark(pm, helpers)
    expect(back).toEqual(tree)
  })

  it('wraps stray block-level text in a paragraph (Comark autoUnwrap inverse)', () => {
    const tree: ComarkTree = {
      nodes: ['hello'],
      frontmatter: {},
      meta: {},
    }
    const pm = comarkToPmDoc(tree, helpers)
    expect(pm.content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello' }],
    })
  })

  it('wraps stray inline-only tags appearing at block level', () => {
    // A bold span at the root of an AST is unusual but valid — Comark
    // would emit it inside a paragraph normally. We wrap defensively
    // so PM stays schema-valid.
    const tree: ComarkTree = {
      nodes: [['strong', {}, 'orphan'] as never],
      frontmatter: {},
      meta: {},
    }
    const pm = comarkToPmDoc(tree, helpers)
    expect(pm.content?.[0]?.type).toBe('paragraph')
    expect(pm.content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe('bold')
  })

  it('produces an empty-paragraph doc for an empty AST', () => {
    const pm = comarkToPmDoc({ nodes: [], frontmatter: {}, meta: {} }, helpers)
    expect(pm).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
  })

  it('throws on a non-doc PM root', () => {
    expect(() => pmDocToComark({ type: 'paragraph' }, helpers)).toThrow(/Expected PM doc/)
  })

  it('preserves frontmatter / meta carry from the editor storage', () => {
    const result = pmDocToComark({ type: 'doc', content: [] }, helpers, {
      frontmatter: { title: 'T' },
      meta: { x: 1 },
    })
    expect(result.frontmatter).toEqual({ title: 'T' })
    expect(result.meta).toEqual({ x: 1 })
  })
})
