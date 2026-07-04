<script setup lang="ts">
/**
 * Sole purpose of this playground: prepare the Nuxt UI upstream change
 * that lets `<UEditor>` opt into a Comark-aware schema.
 *
 * `<UComarkEditor>` (see `~/components/UComarkEditor.vue`) is a near-verbatim
 * fork of Nuxt UI's `<UEditor>` — the only meaningful edit is swapping the
 * hardcoded StarterKit + @tiptap/markdown stack for `comark-tiptap/vue`'s
 * `useComarkEditor`. This page runs it side-by-side with the stock
 * `<UEditor>`, sharing one toolbar config, so the fork's behaviour can be
 * checked against upstream before landing a `kit: 'comark'` opt-in there.
 */
import { ref } from 'vue'
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

// One toolbar config for both editors — handlers resolve symbolically
// against whatever extension graph is loaded (StarterKit on the left,
// ComarkKit on the right). Button states should match for every
// overlapping schema element (bold / italic / strike / lists / quote).
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
        <h1 class="text-2xl font-bold" data-test="compare-heading">UEditor vs UComarkEditor</h1>
        <p class="text-sm text-muted">Groundwork for a Comark-aware `kit` option on Nuxt UI's UEditor.</p>
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
      Same markdown seed, same toolbar items, same drag handle. Stock
      <code>&lt;UEditor&gt;</code> on the left uses StarterKit + @tiptap/markdown.
      <code>&lt;UComarkEditor&gt;</code> on the right uses ComarkKit. Toolbar handler states should
      match across both for every overlapping schema element.
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

      <!-- Comark fork -->
      <section data-test="comark-editor-section">
        <h2 class="mb-2 font-semibold">Forked <code>&lt;UComarkEditor&gt;</code></h2>
        <UComarkEditor
          v-model="comarkMd"
          content-type="markdown"
          :placeholder="'Type something…'"
          class="rounded-lg border border-default p-4 min-h-60 focus-within:outline-none"
          data-test="comark-editor"
        >
          <template #default="{ editor }">
            <template v-if="editor">
              <UEditorDragHandle :editor="editor" data-test="comark-drag-handle" />
              <UEditorToolbar
                :editor="editor"
                :items="toolbarItems"
                layout="bubble"
                data-test="comark-toolbar"
              />
            </template>
          </template>
        </UComarkEditor>

        <details class="mt-3 text-xs">
          <summary class="cursor-pointer">Output (markdown)</summary>
          <pre class="mt-2 max-h-48 overflow-auto rounded bg-elevated p-2" data-test="comark-output">{{ comarkMd }}</pre>
        </details>
      </section>
    </div>
  </UContainer>
</template>
