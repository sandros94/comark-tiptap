/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest'
import { htmlAttrSpec } from '../../src/utils/html-attrs'

function makeEl(html: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  return wrap.firstElementChild as HTMLElement
}

describe('htmlAttrSpec — parseHTML', () => {
  it('captures every non-reserved DOM attribute into a Record', () => {
    const spec = htmlAttrSpec({ reserved: ['level'] })
    const el = makeEl('<h1 level="ignored" id="top" class="big" data-x="y" aria-label="hi"></h1>')
    expect(spec.htmlAttrs!.parseHTML!(el)).toEqual({
      'id': 'top',
      'class': 'big',
      'data-x': 'y',
      'aria-label': 'hi',
    })
  })

  it('returns null when there is nothing to capture (PM treats it as default)', () => {
    const spec = htmlAttrSpec()
    expect(spec.htmlAttrs!.parseHTML!(makeEl('<p></p>'))).toBe(null)
  })

  it('ignores PM/Tiptap-internal attributes', () => {
    const spec = htmlAttrSpec()
    const el = makeEl(
      '<p data-pm-slice-ref="x" data-prosemirror-foo="y" pm-something="z" contenteditable="true" class="kept"></p>',
    )
    expect(spec.htmlAttrs!.parseHTML!(el)).toEqual({ class: 'kept' })
  })

  it('honors `reserved` so a native attr never leaks into htmlAttrs', () => {
    const spec = htmlAttrSpec({ reserved: ['href', 'title'] })
    const el = makeEl('<a href="/x" title="t" target="_blank" rel="noopener"></a>')
    expect(spec.htmlAttrs!.parseHTML!(el)).toEqual({
      target: '_blank',
      rel: 'noopener',
    })
  })
})

describe('htmlAttrSpec — renderHTML', () => {
  it('spreads the Record back to a flat HTML attrs object', () => {
    const spec = htmlAttrSpec()
    expect(
      spec.htmlAttrs!.renderHTML!({
        htmlAttrs: { 'id': 'top', 'class': 'big', 'data-x': 'y' },
      }),
    ).toEqual({ 'id': 'top', 'class': 'big', 'data-x': 'y' })
  })

  it('produces nothing when htmlAttrs is missing or empty', () => {
    const spec = htmlAttrSpec()
    expect(spec.htmlAttrs!.renderHTML!({})).toEqual({})
    expect(spec.htmlAttrs!.renderHTML!({ htmlAttrs: null })).toEqual({})
    expect(spec.htmlAttrs!.renderHTML!({ htmlAttrs: {} })).toEqual({})
  })

  it('coerces non-string values to strings (booleans, numbers)', () => {
    const spec = htmlAttrSpec()
    expect(
      spec.htmlAttrs!.renderHTML!({
        htmlAttrs: { 'aria-hidden': true, 'tabindex': 0 },
      }),
    ).toEqual({ 'aria-hidden': 'true', 'tabindex': '0' })
  })

  it('drops nullish entries', () => {
    const spec = htmlAttrSpec()
    expect(
      spec.htmlAttrs!.renderHTML!({
        htmlAttrs: { class: 'a', id: null, style: undefined },
      }),
    ).toEqual({ class: 'a' })
  })
})
