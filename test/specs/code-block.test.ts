import { describe, expect, it } from 'vitest'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { codeBlockSpec } from '../../src/specs/code-block'

const helpers = createSerializer({ nodes: [codeBlockSpec], marks: [] })

describe('codeBlockSpec', () => {
  it('round-trips a basic ts code block', () => {
    const original: ComarkElement = [
      'pre',
      { language: 'ts' },
      ['code', { class: 'language-ts' }, 'const x = 1'],
    ]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm).toEqual({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'const x = 1' }],
    })
    expect(codeBlockSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves filename, highlights, and meta', () => {
    const original: ComarkElement = [
      'pre',
      { language: 'ts', filename: 'a.ts', highlights: [1, 2], meta: 'foo=bar' },
      ['code', { class: 'language-ts' }, 'x'],
    ]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm.attrs).toMatchObject({
      language: 'ts',
      filename: 'a.ts',
      highlights: [1, 2],
      meta: 'foo=bar',
    })
    expect(codeBlockSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves htmlAttrs on the outer pre', () => {
    const original: ComarkElement = [
      'pre',
      { 'language': 'ts', 'class': 'shiki', 'data-theme': 'dark' },
      ['code', { class: 'language-ts' }, 'x'],
    ]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm.attrs?.htmlAttrs).toEqual({ 'class': 'shiki', 'data-theme': 'dark' })
    expect(codeBlockSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves non-language attrs on the inner code element', () => {
    const original: ComarkElement = [
      'pre',
      { language: 'ts' },
      ['code', { 'class': 'language-ts', 'data-line-numbers': 'true' }, 'x'],
    ]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm.attrs?.codeHtmlAttrs).toEqual({ 'data-line-numbers': 'true' })
    expect(codeBlockSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('drops the redundant `class="language-x"` on the inner code (it is derivable)', () => {
    // After round-trip, the inner code's class is recomputed from `language`,
    // so it should be exactly one entry — no duplicates, no leftover class.
    const original: ComarkElement = [
      'pre',
      { language: 'ts' },
      ['code', { class: 'language-ts' }, 'x'],
    ]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm.attrs).not.toHaveProperty('codeHtmlAttrs')
  })

  it('handles a language-less code block', () => {
    const original: ComarkElement = ['pre', {}, ['code', {}, 'plain']]
    const pm = codeBlockSpec.fromComark(original, helpers)!
    expect(pm.attrs).toBeUndefined()
    expect(codeBlockSpec.toComark(pm, helpers)).toEqual(original)
  })
})
