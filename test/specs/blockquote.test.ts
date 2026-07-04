import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../../src/specs/paragraph'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { blockquoteSpec } from '../../src/specs/blockquote'

const helpers = createSerializer({
  nodes: [blockquoteSpec, paragraphSpec],
  marks: [],
})

describe('blockquoteSpec', () => {
  it('round-trips a blockquote with a single paragraph child (autoUnwrapped form)', () => {
    // Comark's parser emits the autoUnwrapped form for single-paragraph
    // containers; we mirror it on the way out.
    const original: ComarkElement = ['blockquote', {}, 'Q']
    const pm = blockquoteSpec.fromComark(original, helpers)!
    expect(pm).toEqual({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q' }] }],
    })
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('round-trips the wrapped form too — `[blockquote, {}, [p, {}, Q]]` is also valid input', () => {
    const original: ComarkElement = ['blockquote', {}, ['p', {}, 'Q']]
    const pm = blockquoteSpec.fromComark(original, helpers)!
    // Output is the autoUnwrapped form (Comark's canonical).
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(['blockquote', {}, 'Q'])
  })

  it('preserves htmlAttrs (`data-cite` etc.) on the blockquote element', () => {
    const original: ComarkElement = ['blockquote', { 'data-cite': 'rfc' }, 'Q']
    const pm = blockquoteSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({ htmlAttrs: { 'data-cite': 'rfc' } })
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('keeps both paragraphs wrapped when there are multiple', () => {
    const original: ComarkElement = ['blockquote', {}, ['p', {}, 'A'], ['p', {}, 'B']]
    const pm = blockquoteSpec.fromComark(original, helpers)!
    expect(pm.content).toHaveLength(2)
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('keeps the paragraph wrap when the inner paragraph carries htmlAttrs', () => {
    // autoUnwrap would lose the class otherwise.
    const original: ComarkElement = ['blockquote', {}, ['p', { class: 'lead' }, 'Q']]
    const pm = blockquoteSpec.fromComark(original, helpers)!
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('seeds an empty paragraph for a childless blockquote (`>` alone is invalid PM otherwise)', () => {
    // `parse('>\n')` yields `['blockquote', {}]`; PM's `block+` schema rejects
    // an empty blockquote, so we must synthesize a placeholder child.
    const pm = blockquoteSpec.fromComark(['blockquote', {}] as ComarkElement, helpers)!
    expect(pm.content).toEqual([{ type: 'paragraph' }])
  })
})
