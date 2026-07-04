<script setup lang="ts">
import { ref } from 'vue'
import { ComarkEditor, defineComarkVueComponent } from 'comark-tiptap/vue'
import type { ComarkTree, JSONContent } from 'comark-tiptap'
import type { Editor } from '@tiptap/vue-3'

/* Vue playground for `comark-tiptap` + `comark-tiptap/vue`: the managed
   `<ComarkEditor v-model>`, a user component (`defineComarkVueComponent`,
   routed through the core factory), and the output flavors. */

const SEED = `# comark-tiptap

Edit me — the panels below update live.

- **markdown** in, markdown / AST / PM-JSON out
- lists, \`code\`, [links](https://comark.dev), and tables round-trip losslessly

> Strings are markdown, never HTML.
`

/* Inline component with no NodeView — round-trips as the generic marker, enough
   to prove the components pipeline is wired end to end. */
const Badge = defineComarkVueComponent({
  name: 'badge',
  kind: 'inline',
  props: { tone: { type: 'string', default: 'info' } },
})

const md = ref(SEED)
const ast = ref<ComarkTree | null>(null)
const json = ref<JSONContent | null>(null)

/* `md` is the v-model; AST/JSON are read off the editor the component hands us
   on ready/update — one editor, no bring-your-own orphan. */
function sync(editor: Editor): void {
  ast.value = editor.storage.comark.getAst()
  json.value = editor.getJSON() as JSONContent
}
</script>

<template>
  <main>
    <h1>comark-tiptap — Vue playground</h1>
    <ComarkEditor
      v-model.markdown="md"
      :components="[Badge]"
      class="editor"
      @ready="sync"
      @update="sync"
    />

    <section class="panels">
      <details open>
        <summary>Markdown</summary>
        <pre>{{ md }}</pre>
      </details>
      <details>
        <summary>Comark AST</summary>
        <pre>{{ JSON.stringify(ast, null, 2) }}</pre>
      </details>
      <details>
        <summary>ProseMirror JSON</summary>
        <pre>{{ JSON.stringify(json, null, 2) }}</pre>
      </details>
    </section>
  </main>
</template>

<style>
main {
  max-width: 760px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: system-ui, sans-serif;
}
.editor {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.5rem 1rem;
}
.editor .ProseMirror {
  outline: none;
  min-height: 8rem;
}
.panels {
  margin-top: 1rem;
}
.panels pre {
  overflow: auto;
  background: #f6f6f6;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
}
</style>
