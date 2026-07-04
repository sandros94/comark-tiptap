/**
 * @vitest-environment happy-dom
 *
 * Coverage for `useComarkEditor` — the Vue-layer composable that wraps
 * a Tiptap `Editor` configured with `ComarkKit`. The composable's
 * surface collapsed to a single `setContent` setter + `contentType`
 * dispatch + `MaybeRefOrGetter` content. Tests cover every flavor on
 * both the seed path and the runtime setter, plus the unmount-cleanup
 * contract.
 *
 * The composable uses `onMounted` / `onBeforeUnmount`, so each test
 * mounts a tiny Vue component that calls the composable in `setup`
 * and exposes the return value through a captured closure variable. We
 * avoid `@vue/test-utils` because it isn't a project dep — the manual
 * `createApp` mount is small and the assertions don't need the extra
 * surface area.
 */

import type { Editor, JSONContent } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, shallowRef, type App } from 'vue'
import type { ComarkTree } from 'comark-tiptap'
import {
  useComarkEditor,
  type UseComarkEditorOptions,
  type UseComarkEditorReturn,
} from '../../src/vue/use-comark-editor'

/** Wait for the editor's next `update` event. */
function nextUpdate(editor: Editor, timeoutMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (): void => {
      editor.off('update', handler)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      editor.off('update', handler)
      reject(new Error(`Editor 'update' did not fire within ${timeoutMs}ms`))
    }, timeoutMs)
    editor.on('update', handler)
  })
}

async function flushVueLifecycle(): Promise<void> {
  await nextTick()
}

const flushMicrotasks = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

interface Mounted {
  app: App
  container: HTMLElement
  result: UseComarkEditorReturn
}

/**
 * Mount a synthetic component that calls `useComarkEditor(options)`
 * and exposes the return value. Implementation note: stash the return
 * on a closure-scoped `let` rather than a `ref` because
 * `ref<{ editor: ShallowRef<...> }>` would proxy through `reactive`
 * and silently unwrap the nested refs at read time.
 */
function mount(options: UseComarkEditorOptions): Mounted {
  let captured: UseComarkEditorReturn | null = null
  const Comp = defineComponent({
    setup() {
      captured = useComarkEditor(options)
      return () => h('div', { 'data-test': 'editor-host' })
    },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(Comp)
  app.mount(container)
  if (!captured) throw new Error('useComarkEditor never ran (component setup not invoked)')
  return { app, container, result: captured }
}

const live: Mounted[] = []
beforeEach(() => {
  live.length = 0
})
afterEach(() => {
  while (live.length) {
    const m = live.pop()!
    m.app.unmount()
    m.container.remove()
  }
})
function track(m: Mounted): Mounted {
  live.push(m)
  return m
}

function getDoc(editor: Editor): JSONContent {
  return editor.getJSON() as JSONContent
}

describe('useComarkEditor — initial seed (plain values)', () => {
  it('mounts with a markdown string seed (default contentType)', async () => {
    const m = track(mount({ content: '# Hello\n\nbody **strong**.\n' }))

    // Two waits: Vue's scheduler has to flush so `onMounted` runs, then
    // the parsed-markdown seed lands when the editor fires its first
    // `update` event.
    await flushVueLifecycle()
    await nextUpdate(m.result.editor.value!)

    expect(m.result.isReady.value).toBe(true)
    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(1)
    expect(blocks[1]?.type).toBe('paragraph')
  })

  it('mounts with a Comark AST seed via contentType="ast"', async () => {
    const tree: ComarkTree = {
      nodes: [
        ['h2', {}, 'AST seed'],
        ['p', {}, 'inline'],
      ],
      frontmatter: { title: 't' },
      meta: { x: 1 },
    }
    const m = track(mount({ content: tree, contentType: 'ast' }))

    // AST seed is applied via `setComarkAst({ emitUpdate: false })`
    // from inside `onMounted` — synchronous, no editor `update` event
    // fires. Just flush Vue's lifecycle to make `editor.value`
    // available.
    await flushVueLifecycle()

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(2)
    expect(m.result.editor.value!.storage.comark.frontmatter).toEqual({ title: 't' })
    expect(m.result.editor.value!.storage.comark.meta).toEqual({ x: 1 })
  })

  it('mounts with a PM JSON seed via contentType="json" + object', async () => {
    const json: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'preset' }] }],
    }
    const m = track(mount({ content: json, contentType: 'json' }))

    await flushVueLifecycle()

    expect(getDoc(m.result.editor.value!).content?.[0]?.content?.[0]?.text).toBe('preset')
  })

  it('mounts with no seed and exposes an empty doc', async () => {
    const m = track(mount({}))

    await flushVueLifecycle()

    const blocks = getDoc(m.result.editor.value!).content ?? []
    // StarterKit's TrailingNode adds a trailing empty paragraph.
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks[0]?.type).toBe('paragraph')
  })

  it('mounts with an HTML seed via contentType="html" (synchronous)', async () => {
    const m = track(mount({ content: '<h2>HTML</h2>', contentType: 'html' }))

    await flushVueLifecycle()

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(2)
  })
})

describe('useComarkEditor — reactive content (ref / getter)', () => {
  it('watches a Ref<string> and pushes external markdown changes in', async () => {
    const md = ref('# Original\n')
    const m = track(mount({ content: md }))
    await flushVueLifecycle()
    const editor = m.result.editor.value!
    await nextUpdate(editor) // seed lands

    md.value = '## Changed\n'
    await flushVueLifecycle()
    await nextUpdate(editor) // external change lands

    const blocks = getDoc(editor).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(2)
  })

  it('watches a getter (() => value) and propagates updates', async () => {
    // shallowRef avoids Vue's deep `UnwrapRef` recursing through
    // Comark's recursive `ComarkNode` union (TS2589 with plain `ref`).
    const tree = shallowRef<ComarkTree>({
      nodes: [['h1', {}, 'first']],
      frontmatter: {},
      meta: {},
    })
    const m = track(mount({ content: () => tree.value, contentType: 'ast' }))
    await flushVueLifecycle()

    tree.value = { nodes: [['h3', {}, 'second']], frontmatter: {}, meta: {} }
    await flushVueLifecycle()

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(3)
  })

  it('plain (non-reactive) content is mount-only and ignores later mutation', async () => {
    // Plain object — composable doesn't watch it. We mutate the
    // reference after mount and assert the editor doesn't follow.
    const tree: ComarkTree = {
      nodes: [['h1', {}, 'plain seed']],
      frontmatter: {},
      meta: {},
    }
    const m = track(mount({ content: tree, contentType: 'ast' }))
    await flushVueLifecycle()

    // Mutating the same object reference doesn't trigger any watch —
    // the composable only watches refs/getters.
    tree.nodes = [['h6', {}, 'mutated']]
    await flushVueLifecycle()

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(1) // still the original seed
  })
})

describe('useComarkEditor — `setContent` imperative setter', () => {
  it('routes by call-time contentType="markdown" (async)', async () => {
    const m = track(mount({ content: 'first\n' }))
    await flushVueLifecycle()
    const editor = m.result.editor.value!
    await nextUpdate(editor) // seed lands

    await m.result.setContent('## Replaced\n\n- a\n- b\n', { contentType: 'markdown' })
    await nextUpdate(editor)

    const blocks = getDoc(editor).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[1]?.type).toBe('bulletList')
  })

  it('routes by call-time contentType="ast" (synchronous)', async () => {
    const m = track(mount({ content: '' }))
    await flushVueLifecycle()

    await m.result.setContent(
      {
        nodes: [['h3', {}, 'set via AST']],
        frontmatter: {},
        meta: {},
      },
      { contentType: 'ast' },
    )

    // setComarkAst is synchronous once given an object.
    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(3)
  })

  it('routes by call-time contentType="json" (synchronous)', async () => {
    const m = track(mount({ content: 'starter\n' }))
    await flushVueLifecycle()
    await nextUpdate(m.result.editor.value!) // seed lands first

    await m.result.setContent(
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'JSON' }] },
        ],
      },
      { contentType: 'json' },
    )

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.content?.[0]?.text).toBe('JSON')
  })

  it('routes by call-time contentType="html" (synchronous)', async () => {
    const m = track(mount({ content: '' }))
    await flushVueLifecycle()

    await m.result.setContent('<h2>Set via HTML</h2>', { contentType: 'html' })

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(2)
  })

  it('functional setContent receives current content for derivation', async () => {
    const m = track(mount({ content: '# Original\n', contentType: 'markdown' }))
    await flushVueLifecycle()
    const editor = m.result.editor.value!
    await nextUpdate(editor)

    await m.result.setContent(
      async ({ content }) => `${(content as string).trimEnd()}\n\nappended\n`,
    )
    await nextUpdate(editor)

    const blocks = getDoc(editor).content ?? []
    const appended = blocks.find(
      (b) => b.type === 'paragraph' && (b.content ?? [])[0]?.text === 'appended',
    )
    expect(appended).toBeDefined()
  })

  it('uses the option-level contentType when no per-call contentType is given', async () => {
    // No initial content: `setComarkAst('')` would warn on JSON.parse,
    // and the seed isn't part of this test's contract — the per-call
    // routing is.
    const m = track(mount({ contentType: 'ast' }))
    await flushVueLifecycle()

    await m.result.setContent({
      nodes: [['h4', {}, 'option-level routing']],
      frontmatter: {},
      meta: {},
    })

    const blocks = getDoc(m.result.editor.value!).content ?? []
    expect(blocks[0]?.type).toBe('heading')
    expect(blocks[0]?.attrs?.level).toBe(4)
  })
})

describe('useComarkEditor — getters', () => {
  it('getAst / getMarkdown / getJson / getHtml read the current content', async () => {
    const m = track(mount({ content: '# Hi\n' }))
    await flushVueLifecycle()
    await nextUpdate(m.result.editor.value!)

    const ast = m.result.getAst()
    expect(ast).not.toBeNull()
    expect(ast!.nodes[0]).toBeDefined()

    const md = await m.result.getMarkdown()
    expect(md).not.toBeNull()
    expect(md!.trimEnd()).toContain('# Hi')

    const json = m.result.getJson()
    expect(json?.type).toBe('doc')
    expect(json?.content?.[0]?.type).toBe('heading')

    const html = m.result.getHtml()
    expect(html).not.toBeNull()
    expect(html!).toContain('<h1')
    expect(html!).toContain('Hi')
  })
})

describe('useComarkEditor — lifecycle hooks', () => {
  it('fires onCreate exactly once with the editor instance', async () => {
    const calls: unknown[] = []
    track(
      mount({
        content: '# x\n',
        onCreate: (e) => calls.push(e),
      }),
    )
    // Tiptap dispatches its own `create` event asynchronously via
    // `setTimeout(0)` inside the constructor.
    await flushVueLifecycle()
    await flushMicrotasks()

    expect(calls).toHaveLength(1)
    expect((calls[0] as { state: unknown }).state).toBeDefined()
  })

  it('fires onUpdate when content changes via setContent', async () => {
    const calls: number[] = []
    const m = track(
      mount({
        content: '# x\n',
        onUpdate: () => calls.push(Date.now()),
      }),
    )
    await flushVueLifecycle()
    const editor = m.result.editor.value!
    await nextUpdate(editor)
    const baseline = calls.length

    await m.result.setContent('# y\n')
    await nextUpdate(editor)

    expect(calls.length).toBeGreaterThan(baseline)
  })

  it('destroys the editor on unmount', async () => {
    const m = mount({ content: '# x\n' })
    await flushVueLifecycle()
    const editor = m.result.editor.value!
    expect(editor.isDestroyed).toBe(false)

    m.app.unmount()
    m.container.remove()

    expect(editor.isDestroyed).toBe(true)
  })
})
