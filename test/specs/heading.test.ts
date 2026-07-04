import { describe, expect, it } from 'vitest'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { headingSpec } from '../../src/specs/heading'

const helpers = createSerializer({ nodes: [headingSpec], marks: [] })

describe('headingSpec.toComark', () => {
  it('emits the correct h<level> tag', () => {
    for (let level = 1; level <= 6; level++) {
      const result = headingSpec.toComark(
        {
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: 'H' }],
        },
        helpers,
      )
      expect(result).toEqual([`h${level}`, {}, 'H'])
    }
  })

  it('clamps level to [1, 6]', () => {
    expect(headingSpec.toComark({ type: 'heading', attrs: { level: 99 } }, helpers)).toEqual([
      'h6',
      {},
    ])
    expect(headingSpec.toComark({ type: 'heading', attrs: { level: 0 } }, helpers)).toEqual([
      'h1',
      {},
    ])
  })

  it('emits htmlAttrs as flat element attributes', () => {
    const result = headingSpec.toComark(
      {
        type: 'heading',
        attrs: {
          level: 2,
          htmlAttrs: { id: 'sec-1', class: 'sticky' },
        },
        content: [{ type: 'text', text: 'X' }],
      },
      helpers,
    )
    expect(result).toEqual(['h2', { id: 'sec-1', class: 'sticky' }, 'X'])
  })
})

describe('headingSpec.fromComark', () => {
  it.each([1, 2, 3, 4, 5, 6])('reads h%d into a heading with the right level', (level) => {
    const el: ComarkElement = [`h${level}`, {}, 'T']
    const result = headingSpec.fromComark(el, helpers)
    expect(result).toEqual({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text: 'T' }],
    })
  })

  it('routes element attributes onto htmlAttrs (id from {#anchor}, class from {.foo})', () => {
    const result = headingSpec.fromComark(
      ['h2', { id: 'sec-1', class: 'sticky' }, 'X'] as ComarkElement,
      helpers,
    )
    expect(result?.attrs).toEqual({
      level: 2,
      htmlAttrs: { id: 'sec-1', class: 'sticky' },
    })
  })

  it('drops Comark `$` source-position metadata', () => {
    const result = headingSpec.fromComark(
      ['h1', { id: 'a', $: { line: 10 } }, 'X'] as ComarkElement,
      helpers,
    )
    expect(result?.attrs).toEqual({ level: 1, htmlAttrs: { id: 'a' } })
  })
})

describe('heading round-trip', () => {
  it('preserves an h2 with id and class', () => {
    const original: ComarkElement = ['h2', { id: 'top', class: 'big' }, 'Hello']
    const pm = headingSpec.fromComark(original, helpers)!
    const back = headingSpec.toComark(pm, helpers)
    expect(back).toEqual(original)
  })
})
