import { describe, expect, it } from 'vitest'
import { createSerializer } from '../../src/serializer'
import { paragraphSpec } from '../../src/specs/paragraph'
import type { ComarkElement } from '../../src/types'
import { imageSpec } from '../../src/specs/image'

const helpers = createSerializer({
  nodes: [paragraphSpec, imageSpec],
  marks: [],
})

describe('imageSpec', () => {
  it('round-trips a basic image', () => {
    const original: ComarkElement = ['img', { src: '/x.png', alt: 'alt', title: 'title' }]
    const pm = imageSpec.fromComark(original, helpers)!
    expect(pm).toEqual({
      type: 'image',
      attrs: { src: '/x.png', alt: 'alt', title: 'title' },
    })
    expect(imageSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('promotes width/height to native attrs (stock Tiptap Image declares them); class flows via htmlAttrs', () => {
    const original: ComarkElement = [
      'img',
      { src: '/x.png', alt: 'alt', width: '800', height: '600', class: 'lead' },
    ]
    const pm = imageSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({
      src: '/x.png',
      alt: 'alt',
      title: null,
      width: '800',
      height: '600',
      htmlAttrs: { class: 'lead' },
    })
    expect(imageSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves an explicit empty alt (decorative-image WCAG marker)', () => {
    // `alt=""` is semantically distinct from a missing alt; a truthy check
    // would drop it, so it must survive the round-trip.
    const original: ComarkElement = ['img', { src: '/x.png', alt: '' }]
    const pm = imageSpec.fromComark(original, helpers)!
    expect(pm.attrs?.alt).toBe('')
    expect(imageSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('round-trips an inline image inside a paragraph', () => {
    const original: ComarkElement = [
      'p',
      {},
      'see ',
      ['img', { src: '/icon.png', alt: 'i' }],
      ' here',
    ]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })
})
