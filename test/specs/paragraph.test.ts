import { describe, expect, it } from 'vitest'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement, ComarkHelpers } from '../../src/types'
import { paragraphSpec } from '../../src/specs/paragraph'

function makeHelpers(): ComarkHelpers {
  return createSerializer({ nodes: [paragraphSpec], marks: [] })
}

describe('paragraphSpec.toComark', () => {
  it('converts a plain PM paragraph to a Comark `p`', () => {
    const h = makeHelpers()
    const result = paragraphSpec.toComark(
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'hello' }],
      },
      h,
    )
    expect(result).toEqual(['p', {}, 'hello'])
  })

  it('emits `htmlAttrs` as flat element attributes', () => {
    const h = makeHelpers()
    const result = paragraphSpec.toComark(
      {
        type: 'paragraph',
        attrs: { htmlAttrs: { class: 'lead', id: 'intro' } },
        content: [{ type: 'text', text: 'hi' }],
      },
      h,
    )
    expect(result).toEqual(['p', { class: 'lead', id: 'intro' }, 'hi'])
  })

  it('handles an empty paragraph', () => {
    const h = makeHelpers()
    expect(paragraphSpec.toComark({ type: 'paragraph' }, h)).toEqual(['p', {}])
  })
})

describe('paragraphSpec.fromComark', () => {
  it('converts a Comark `p` to a PM paragraph', () => {
    const h = makeHelpers()
    const result = paragraphSpec.fromComark(['p', {}, 'hello'] as ComarkElement, h)
    expect(result).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello' }],
    })
  })

  it('routes element attributes into `htmlAttrs`', () => {
    const h = makeHelpers()
    const result = paragraphSpec.fromComark(
      ['p', { class: 'lead', id: 'intro' }, 'x'] as ComarkElement,
      h,
    )
    expect(result).toEqual({
      type: 'paragraph',
      attrs: { htmlAttrs: { class: 'lead', id: 'intro' } },
      content: [{ type: 'text', text: 'x' }],
    })
  })

  it('drops Comark `$` source-position metadata', () => {
    const h = makeHelpers()
    const result = paragraphSpec.fromComark(
      ['p', { class: 'a', $: { line: 4 } }, 'x'] as ComarkElement,
      h,
    )
    expect(result?.attrs).toEqual({ htmlAttrs: { class: 'a' } })
  })

  it('omits `attrs` entirely when there are no html attrs', () => {
    const h = makeHelpers()
    const result = paragraphSpec.fromComark(['p', {}, 'x'] as ComarkElement, h)
    expect(result).not.toHaveProperty('attrs')
  })
})

describe('paragraph round-trip', () => {
  it('Comark → PM → Comark is identity for a paragraph with attrs', () => {
    const h = makeHelpers()
    const original: ComarkElement = ['p', { 'class': 'lead', 'data-x': 'y' }, 'hello']
    const pm = paragraphSpec.fromComark(original, h)!
    const back = paragraphSpec.toComark(pm, h)
    expect(back).toEqual(original)
  })
})
