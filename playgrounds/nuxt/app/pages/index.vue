<script setup lang="ts">
/**
 * This playground verifies UEditor's external-editor shell. The left side is
 * its built-in StarterKit editor; the right side supplies a ComarkKit editor
 * from `useComarkEditor`, so Comark owns the content, schema and lifecycle.
 */
import { ref } from 'vue'
import { useComarkEditor } from 'comark-tiptap/vue'
import { tv } from '@nuxt/ui/utils/tv'
import theme from '#build/ui/editor'

// `EditorItem` is the raw toolbar-item union; the button-shaped fields
// (`icon` / `tooltip`) come from `EditorToolbarItem`. `EditorItem` is a
// structural lower bound that's enough to type the config here.
import type { EditorItem } from '@nuxt/ui/runtime/types/editor.js'

const SEED = `# Side-by-side compare

A paragraph with **bold**, *italic*, ~~strike~~, and \`inline code\`.

- one
- two
- three

> Quoted block with **inline marks**.
`

const stockMd = ref(SEED)
const comarkMd = ref(SEED)
let comarkUpdate = 0

// UEditor supplies scoped prose from its wrapper. Build only the generated
// editable-layout class here; tv's class option can merge kit-owned classes.
const externalEditorClass = tv({ base: theme.slots.base[0] })
const { editor: comarkEditor } = useComarkEditor({
  content: SEED,
  contentType: 'markdown',
  editorOptions: {
    editorProps: {
      attributes: {
        class: externalEditorClass(),
      },
    },
  },
  // Only keeps the comparison markdown output in sync for this playground.
  onUpdate(editor) {
    const update = ++comarkUpdate
    void editor.storage.comark.getMarkdown().then((markdown) => {
      if (update !== comarkUpdate || editor.isDestroyed) return
      comarkMd.value = markdown
    })
  },
})

// One toolbar config for both editors — handlers resolve against the supplied
// editor's extension graph. The overlapping StarterKit / ComarkKit actions
// should behave the same on each side.
const toolbarItems: (EditorItem & {
  icon?: string
  tooltip?: { text: string }
})[][] = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strike' } },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Inline code' } },
  ],
  [
    { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', tooltip: { text: 'Heading 1' } },
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Heading 2' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } },
    { kind: 'blockquote', icon: 'i-lucide-quote', tooltip: { text: 'Quote' } },
  ],
]
</script>

<template>
  <UContainer class="py-6">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold" data-test="compare-heading">UEditor external Comark editor</h1>
        <p class="text-sm text-muted">Nuxt UI provides the shell; comark-tiptap provides the editor.</p>
      </div>
      <UButton
        to="https://github.com/sandros94/comark-tiptap"
        target="_blank"
        icon="i-simple-icons-github"
        color="neutral"
        variant="outline"
      />
    </header>

    <p class="mb-6 text-muted">
      Same markdown seed, toolbar items and drag handle. Stock
      <code>&lt;UEditor&gt;</code> on the left uses StarterKit + @tiptap/markdown.
      The right side passes a ComarkKit editor to <code>&lt;UEditor&gt;</code>; the external editor owns
      its content, schema and lifecycle. Toolbar handler states should match across their overlapping
      schema elements.
    </p>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- Stock UEditor -->
      <section data-test="stock-editor-section">
        <h2 class="mb-2 font-semibold">Stock <code>&lt;UEditor&gt;</code></h2>
        <UEditor
          v-model="stockMd"
          content-type="markdown"
          :placeholder="'Type something…'"
          class="rounded-lg border border-default p-4 min-h-60 focus-within:outline-none"
          data-test="stock-editor"
        >
          <template #default="{ editor }">
            <UEditorDragHandle :editor="editor" data-test="stock-drag-handle" />
            <UEditorToolbar
              :editor="editor"
              :items="toolbarItems"
              layout="bubble"
              data-test="stock-toolbar"
            />
          </template>
        </UEditor>

        <details class="mt-3 text-xs">
          <summary class="cursor-pointer">Output (markdown)</summary>
          <pre class="mt-2 max-h-48 overflow-auto rounded bg-elevated p-2" data-test="stock-output">{{ stockMd }}</pre>
        </details>
      </section>

      <!-- External Comark editor -->
      <section data-test="comark-editor-section">
        <h2 class="mb-2 font-semibold">Comark-backed <code>&lt;UEditor&gt;</code></h2>
        <UEditor
          :editor="comarkEditor"
          class="rounded-lg border border-default p-4 min-h-60 focus-within:outline-none"
          data-test="comark-editor"
        >
          <template #default="{ editor }">
            <UEditorDragHandle :editor="editor" data-test="comark-drag-handle" />
            <UEditorToolbar
              :editor="editor"
              :items="toolbarItems"
              layout="bubble"
              data-test="comark-toolbar"
            />
          </template>
        </UEditor>

        <details class="mt-3 text-xs">
          <summary class="cursor-pointer">Output (markdown)</summary>
          <pre class="mt-2 max-h-48 overflow-auto rounded bg-elevated p-2" data-test="comark-output">{{ comarkMd }}</pre>
        </details>
      </section>
    </div>
  </UContainer>
</template>
