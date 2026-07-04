/**
 * @vitest-environment happy-dom
 *
 * Coverage for the React `<ComarkEditor>` component and
 * `defineComarkReactComponent` — the surface `use-comark-editor.test.tsx`
 * doesn't reach: the controlled outside-in value sync, the echo-loop guard,
 * the BYO-editor branch, children-as-function, and NodeView wiring.
 */
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor, NodeViewWrapper } from '@tiptap/react'
import { ComarkKit, type ComarkTree, type ContentValue, type JSONContent } from 'comark-tiptap'
import { ComarkEditor, defineComarkReactComponent } from '../../src/react/index'

afterEach(cleanup)
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('<ComarkEditor> (React, controlled)', () => {
  it('pushes an outside-in value change into the editor (json flavor)', async () => {
    let editor: Editor | null = null
    let setDoc: (d: JSONContent) => void = () => {}
    const docA: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AAA' }] }],
    }
    const docB: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'BBB' }] }],
    }
    function Host(): React.ReactNode {
      const [doc, setD] = useState<JSONContent>(docA)
      setDoc = setD
      return (
        <ComarkEditor
          value={doc}
          onChange={() => {}}
          contentType="json"
          onReady={(e) => {
            editor = e
          }}
        />
      )
    }
    render(<Host />)
    await waitFor(() => expect(editor).not.toBeNull())
    const ed = editor as unknown as Editor
    await waitFor(() => expect(ed.getText()).toContain('AAA'))

    await act(async () => {
      setDoc(docB)
      await tick()
    })
    await waitFor(() => expect(ed.getText()).toContain('BBB'))
  })

  it('emits onChange on an edit without echoing back into a loop', async () => {
    let editor: Editor | null = null
    const onChange = vi.fn<(v: ContentValue) => void>()
    function Host(): React.ReactNode {
      const [md, setMd] = useState('# A')
      return (
        <ComarkEditor
          value={md}
          contentType="markdown"
          onChange={(v) => {
            onChange(v)
            setMd(v as string)
          }}
          onReady={(e) => {
            editor = e
          }}
        />
      )
    }
    render(<Host />)
    await waitFor(() => expect(editor).not.toBeNull())
    const ed = editor as unknown as Editor
    await waitFor(() => expect(ed.getText()).toContain('A'))

    onChange.mockClear()
    await act(async () => {
      ed.commands.setComarkMarkdown('# Changed')
      await tick()
    })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const settled = onChange.mock.calls.length

    // The controlled value now equals the emitted content; the shadow guard
    // must stop it from being re-applied and re-emitted.
    await act(async () => {
      await tick()
    })
    expect(onChange.mock.calls.length).toBe(settled)
  })

  it('renders a pre-built editor (BYO) and skips the internal one', async () => {
    const editor = new Editor({ extensions: [ComarkKit], content: '' })
    const { container } = render(
      <ComarkEditor editor={editor}>
        {(e) => <div data-test="tb">{e ? 'ready' : 'no'}</div>}
      </ComarkEditor>,
    )
    expect(container.querySelector('[data-comark-editor-content]')).not.toBeNull()
    expect(container.querySelector('[data-test="tb"]')?.textContent).toBe('ready')
    editor.destroy()
  })

  it('renders the fallback slot only until the editor exists', async () => {
    let editor: Editor | null = null
    const { container } = render(
      <ComarkEditor
        value=""
        onChange={() => {}}
        fallback={<span data-test="fallback">loading</span>}
        onReady={(e) => {
          editor = e
        }}
      />,
    )
    await waitFor(() => expect(editor).not.toBeNull())
    // Once ready, the content region is present and the fallback is gone.
    expect(container.querySelector('[data-comark-editor-content]')).not.toBeNull()
    expect(container.querySelector('[data-test="fallback"]')).toBeNull()
  })
})

describe('defineComarkReactComponent', () => {
  it('wires a React NodeView onto the extension only when nodeView is provided', () => {
    const View = (): null => null
    const withView = defineComarkReactComponent({
      name: 'alert',
      kind: 'block',
      props: { type: { type: 'string', default: 'info' } },
      nodeView: View,
    })
    const withoutView = defineComarkReactComponent({ name: 'plain', kind: 'block' })

    expect(withView.spec.pmName).toBe('alert')
    expect(withView.definition.name).toBe('alert')
    expect(typeof withView.extension.config.addNodeView).toBe('function')
    expect(withoutView.extension.config.addNodeView).toBeUndefined()
  })

  it('renders the NodeView inside a live editor', async () => {
    function AlertView(): React.ReactNode {
      return <NodeViewWrapper data-test="alert-view">ALERT</NodeViewWrapper>
    }
    const Alert = defineComarkReactComponent({ name: 'alert', kind: 'block', nodeView: AlertView })
    const tree: ComarkTree = {
      nodes: [['alert', {}, ['p', {}, 'x']]],
      frontmatter: {},
      meta: {},
    }
    let editor: Editor | null = null
    const { container } = render(
      <ComarkEditor
        value={tree}
        onChange={() => {}}
        contentType="ast"
        components={[Alert]}
        onReady={(e) => {
          editor = e
        }}
      />,
    )
    await waitFor(() => expect(editor).not.toBeNull())
    await waitFor(() =>
      expect(container.querySelector('[data-test="alert-view"]')?.textContent).toBe('ALERT'),
    )
  })
})
