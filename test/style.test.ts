/**
 * @vitest-environment happy-dom
 */

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { ComarkKit } from '../src/kit'
import { COMARK_STYLE_MARKER, comarkStyle, injectComarkStyles } from '../src/style'

function clearStyleTags(): void {
  for (const tag of Array.from(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`))) {
    tag.remove()
  }
}

afterEach(() => {
  clearStyleTags()
})

describe('comarkStyle payload', () => {
  it('targets every kit-specific marker with single-attribute selectors only', () => {
    expect(comarkStyle).toContain('[data-comark-comment]')
    expect(comarkStyle).toContain('[data-comark-template]')
    expect(comarkStyle).toContain('[data-comark-component]')
    // No descendant combinators that would lock the kit to a specific
    // host wrapper (`.ProseMirror [data-comark-comment]` etc.). Hosts
    // styling the kit outside the editor (e.g. Nuxt UI's read-only
    // Prose render path) can rely on the bare attribute selector.
    expect(comarkStyle).not.toContain('.ProseMirror ')
    // No `!important` so a host stylesheet always wins on collision.
    expect(comarkStyle).not.toContain('!important')
  })

  // Regression: Every kit selector must skip NodeView-owned hosts so
  // consumers providing a NodeView keep full control of the rendered
  // output.
  it('excludes NodeView wrappers from every kit selector', () => {
    const ruleSelectors = comarkStyle.match(/[^{}]+(?=\s*\{)/g) ?? []
    const kitSelectors = ruleSelectors.filter((s) =>
      /\[data-comark-(comment|template|component)\]/.test(s),
    )
    expect(kitSelectors.length).toBeGreaterThan(0)
    for (const s of kitSelectors) {
      expect(s).toContain(':not([data-node-view-wrapper])')
    }
  })
})

describe('injectComarkStyles', () => {
  it('inserts a single <style> tag with the marker attribute', () => {
    injectComarkStyles()
    const tags = document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)
    expect(tags).toHaveLength(1)
    expect(tags[0]?.textContent).toBe(comarkStyle)
  })

  it('is idempotent — repeated calls keep one tag and return the existing one', () => {
    const first = injectComarkStyles()
    const second = injectComarkStyles()
    const third = injectComarkStyles()
    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(1)
  })

  it('forwards the CSP nonce to the style tag', () => {
    const tag = injectComarkStyles('abc123')
    expect(tag?.getAttribute('nonce')).toBe('abc123')
  })

  it('returns null in environments without `document` (ssr / node)', () => {
    // We can't actually unset happy-dom's `document` mid-suite, so we
    // exercise the guard with a stubbed-out global. The check is
    // `typeof document === 'undefined'`, evaluated at call time.
    const realDocument = globalThis.document
    // @ts-expect-error — temporary teardown of the global for this test
    delete globalThis.document
    try {
      expect(injectComarkStyles()).toBeNull()
    } finally {
      globalThis.document = realDocument
    }
  })
})

describe('ComarkKit auto-inject behavior', () => {
  it('injects the stylesheet on editor construction by default', () => {
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(0)
    const editor = new Editor({ element: null, extensions: [ComarkKit] })
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(1)
    editor.destroy()
  })

  it('skips injection when configured with `serializer.injectStyles: false`', () => {
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(0)
    const editor = new Editor({
      element: null,
      extensions: [ComarkKit.configure({ serializer: { injectStyles: false } })],
    })
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(0)
    editor.destroy()
  })

  it('shares a single style tag across multiple editors (dedup)', () => {
    const a = new Editor({ element: null, extensions: [ComarkKit] })
    const b = new Editor({ element: null, extensions: [ComarkKit] })
    const c = new Editor({ element: null, extensions: [ComarkKit] })
    expect(document.querySelectorAll(`style[${COMARK_STYLE_MARKER}]`)).toHaveLength(1)
    a.destroy()
    b.destroy()
    c.destroy()
  })

  it('forwards `injectNonce` to the style tag', () => {
    const editor = new Editor({
      element: null,
      extensions: [
        ComarkKit.configure({ serializer: { injectStyles: true, injectNonce: 'csp-test' } }),
      ],
    })
    const tag = document.querySelector<HTMLStyleElement>(`style[${COMARK_STYLE_MARKER}]`)
    expect(tag?.getAttribute('nonce')).toBe('csp-test')
    editor.destroy()
  })
})
