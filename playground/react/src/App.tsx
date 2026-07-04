import { useState, type ReactNode } from 'react'
import { ComarkEditor, defineComarkReactComponent } from 'comark-tiptap/react'
import type { ComarkTree, JSONContent } from 'comark-tiptap'
import type { Editor } from '@tiptap/react'

/*
 * React playground for `comark-tiptap` + `comark-tiptap/react`. Exercises the
 * controlled `<ComarkEditor value onChange>`, a user component
 * (`defineComarkReactComponent`, which routes through the core factory), and
 * the three output flavors.
 */

const SEED = `# comark-tiptap

Edit me — the panels below update live.

- **markdown** in, markdown / AST / PM-JSON out
- lists, \`code\`, [links](https://comark.dev), and tables round-trip losslessly

> Strings are markdown, never HTML.
`

/* Inline component with no NodeView — round-trips as the generic marker, enough
   to prove the components pipeline is wired end to end. */
const Badge = defineComarkReactComponent({
  name: 'badge',
  kind: 'inline',
  props: { tone: { type: 'string', default: 'info' } },
})

export default function App(): ReactNode {
  const [md, setMd] = useState(SEED)
  const [ast, setAst] = useState<ComarkTree | null>(null)
  const [json, setJson] = useState<JSONContent | null>(null)

  const sync = (editor: Editor): void => {
    setAst(editor.storage.comark.getAst())
    setJson(editor.getJSON() as JSONContent)
  }

  return (
    <main>
      <h1>comark-tiptap — React playground</h1>
      <ComarkEditor
        value={md}
        onChange={(v) => setMd(v as string)}
        contentType="markdown"
        components={[Badge]}
        onReady={sync}
        onUpdate={sync}
        className="editor"
      />

      <section className="panels">
        <details open>
          <summary>Markdown</summary>
          <pre>{md}</pre>
        </details>
        <details>
          <summary>Comark AST</summary>
          <pre>{JSON.stringify(ast, null, 2)}</pre>
        </details>
        <details>
          <summary>ProseMirror JSON</summary>
          <pre>{JSON.stringify(json, null, 2)}</pre>
        </details>
      </section>
    </main>
  )
}
