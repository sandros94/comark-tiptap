/**
 * @vitest-environment happy-dom
 *
 * Coverage for the React binding: the `useComarkEditor` hook across every
 * flavor on the seed path and the runtime setter, plus the controlled
 * `<ComarkEditor>` value/onChange round-trip and unmount cleanup.
 */
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/react'
import type { ComarkTree } from 'comark-tiptap'
import { ComarkEditor, useComarkEditor } from '../../src/react/index'

afterEach(cleanup)

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('useComarkEditor', () => {
  it('creates an editor and reports ready', async () => {
    const { result } = renderHook(() => useComarkEditor())
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    expect(result.current.isReady).toBe(true)
  })

  it('seeds a Comark AST synchronously (contentType: ast)', async () => {
    const tree: ComarkTree = { nodes: [['p', {}, 'Hi']], frontmatter: {}, meta: {} }
    const { result } = renderHook(() => useComarkEditor({ content: tree, contentType: 'ast' }))
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    expect(result.current.getAst()?.nodes).toEqual([['p', {}, 'Hi']])
  })

  it('seeds markdown asynchronously', async () => {
    const { result } = renderHook(() =>
      useComarkEditor({ content: '# Hello', contentType: 'markdown' }),
    )
    await waitFor(() => expect(result.current.getJson()?.content?.length).toBeGreaterThan(0))
    expect(result.current.getJson()?.content?.[0]?.type).toBe('heading')
    await waitFor(async () => expect(await result.current.getMarkdown()).toContain('# Hello'))
  })

  it('seeds ProseMirror JSON', async () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
    }
    const { result } = renderHook(() => useComarkEditor({ content: doc, contentType: 'json' }))
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    expect(result.current.getJson()?.content?.[0]?.content?.[0]?.text).toBe('x')
  })

  it('setContent replaces content (markdown) and getters update', async () => {
    const { result } = renderHook(() => useComarkEditor({ contentType: 'markdown' }))
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    await act(async () => {
      await result.current.setContent('## Replaced')
      await tick()
    })
    await waitFor(async () => expect(await result.current.getMarkdown()).toContain('## Replaced'))
  })

  it('setContent honors a per-call contentType override (html)', async () => {
    const { result } = renderHook(() => useComarkEditor({ contentType: 'markdown' }))
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    await act(async () => {
      await result.current.setContent('<h2>Heading</h2>', { contentType: 'html' })
    })
    const json = result.current.getJson()
    expect(json?.content?.[0]?.type).toBe('heading')
    expect(json?.content?.[0]?.attrs?.level).toBe(2)
  })

  it('supports the functional-updater form', async () => {
    const { result } = renderHook(() =>
      useComarkEditor({ content: '# A', contentType: 'markdown' }),
    )
    await waitFor(() => expect(result.current.getJson()?.content?.length).toBeGreaterThan(0))
    await act(async () => {
      await result.current.setContent(({ content }) => `${content as string}\n\nappended`)
      await tick()
    })
    await waitFor(async () => expect(await result.current.getMarkdown()).toContain('appended'))
  })

  it('destroys the editor on unmount', async () => {
    const { result, unmount } = renderHook(() => useComarkEditor())
    await waitFor(() => expect(result.current.editor).not.toBeNull())
    const editor = result.current.editor as Editor
    unmount()
    /* @tiptap/react schedules destruction, so it lands after a tick. */
    await waitFor(() => expect(editor.isDestroyed).toBe(true))
  })
})

describe('<ComarkEditor>', () => {
  it('seeds a value, fires onReady, and emits onChange in the bound flavor', async () => {
    let ready: Editor | null = null
    const changes: string[] = []
    render(
      <ComarkEditor
        value="# Title"
        contentType="markdown"
        onChange={(v) => changes.push(v as string)}
        onReady={(e) => {
          ready = e
        }}
      />,
    )
    await waitFor(() => expect(ready).not.toBeNull())
    const editor = ready as unknown as Editor
    await waitFor(() => expect(editor.getJSON().content?.length).toBeGreaterThan(0))

    await act(async () => {
      editor.commands.setComarkMarkdown('# Changed')
      await tick()
    })
    await waitFor(() => expect(changes.some((c) => c.includes('# Changed'))).toBe(true))
  })
})
