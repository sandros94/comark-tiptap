<script lang="ts">
import editorTheme from '#build/ui/editor'
</script>

<script setup lang="ts">
/**
 * Drop-in fork of `<UEditor>` for ComarkKit-backed editors. Mirrors
 * UEditor's prop surface (modelValue + contentType, placeholder,
 * mention, handlers provide, theme integration), but swaps the
 * hardcoded StarterKit / @tiptap/markdown / Code / HorizontalRule /
 * Image stack for `comark-tiptap/vue`'s `useComarkEditor`.
 *
 * This is what the "future state" — after a non-breaking @nuxt/ui PR
 * adds a `kit: 'comark'` opt-in mode — would look like for end users:
 * one component, the same toolbar handlers, but a Comark-aware schema
 * with lossless markdown round-trip.
 *
 * The fork is intentionally close to UEditor verbatim so the diff
 * surface for the upstream PR stays small. Sections marked `[COMARK]`
 * are the only meaningful changes.
 */
import type { AnyExtension } from '@tiptap/core'
import { computed, provide, useAttrs, watch } from 'vue'
import defu from 'defu'
import { Primitive, useForwardProps } from 'reka-ui'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { mergeAttributes } from '@tiptap/core'
import { EditorContent, type Editor } from '@tiptap/vue-3'
import { reactiveOmit } from '@vueuse/core'
import {
  useComarkEditor,
  type ComarkEditorSlots,
  type ComarkEditorExpose,
  type ComarkVueComponentExports,
  type ContentType,
  type ContentValue,
} from 'comark-tiptap/vue'
import { useAppConfig } from '#imports'
import { useComponentProps } from '@nuxt/ui/composables'
import { createHandlers } from '@nuxt/ui/runtime/utils/editor.js'
import { tv } from '@nuxt/ui/runtime/utils/tv.js'

defineOptions({ inheritAttrs: false })

interface UiSlots {
  root?: string
  content?: string
  base?: string
}

interface PlaceholderObject {
  placeholder?: string
  mode?: 'firstLine' | 'everyLine'
  [k: string]: unknown
}

interface MentionObject {
  HTMLAttributes?: Record<string, string>
  renderText?: (...args: unknown[]) => string
  renderHTML?: (...args: unknown[]) => unknown
  [k: string]: unknown
}

interface Props {
  as?: string
  modelValue?: ContentValue
  /**
   * Drives both input parsing and v-model emit flavor. When omitted,
   * auto-detected from `modelValue`'s shape (string → markdown,
   * `{ nodes: [...] }` → ast, otherwise json). [COMARK] adds `'ast'`
   * compared to UEditor's `'html' | 'json' | 'markdown'`.
   */
  contentType?: ContentType
  /** Forwarded to `ComarkKit.configure({ starterKit })`. [COMARK] */
  starterKit?: Record<string, unknown>
  /** [COMARK] Comark components from `defineComarkVueComponent`. */
  components?: ReadonlyArray<ComarkVueComponentExports>
  /** [COMARK] Forwarded to `ComarkKit.configure(...)`. */
  kitOptions?: Record<string, unknown>
  placeholder?: string | PlaceholderObject
  mention?: boolean | MentionObject
  handlers?: Record<string, unknown>
  class?: string | string[]
  ui?: UiSlots
  extensions?: AnyExtension[]
  injectCSS?: boolean
  injectNonce?: string
  autofocus?: string | number | boolean | null
  editable?: boolean
  textDirection?: string
  editorProps?: Record<string, unknown>
  parseOptions?: Record<string, unknown>
}

const _props = withDefaults(defineProps<Props>(), {
  as: 'div',
  mention: true,
})

const emits = defineEmits<{
  (e: 'update:modelValue', value: ContentValue): void
}>()

defineSlots<ComarkEditorSlots>()

// [4.9] `useComponentProps` merges the `:ui` prop + theme defaults into
// `props` (replaces 4.7's `useComponentUI`), mirroring Nuxt UI's Editor.vue.
const props = useComponentProps('editor', _props)

const attrs = useAttrs()
const appConfig = useAppConfig()

type EditorTv = (variants?: { placeholderMode?: 'firstLine' | 'everyLine' }) => {
  root: (opts?: { class?: unknown }) => string
  base: (opts?: { class?: unknown }) => string
  content: (opts?: { class?: unknown }) => string
}
const ui = computed(() => {
  const editorOverrides = (appConfig.ui as { editor?: object } | undefined)?.editor
  const tvFn = tv({ extend: tv(editorTheme), ...editorOverrides }) as unknown as EditorTv
  return tvFn({
    placeholderMode: typeof props.placeholder === 'object' ? props.placeholder.mode : undefined,
  })
})

const rootProps = useForwardProps(
  reactiveOmit(
    props,
    'starterKit',
    'extensions',
    'editorProps',
    'contentType',
    'class',
    'placeholder',
    'mention',
    'handlers',
    'components',
    'kitOptions',
    'modelValue',
  ),
)

const editorProps = computed(() =>
  defu(props.editorProps, {
    attributes: {
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      ...attrs,
      class: ui.value.base({ class: props.ui?.base }),
    },
  }),
)

// Default flavor inference — mirrors UEditor's heuristic but adds
// `'ast'` for Comark trees. Strings default to markdown (the
// library's opinion); plain objects → json; AST shapes → ast.
const contentType = computed<ContentType>(() => {
  if (props.contentType) return props.contentType
  if (typeof props.modelValue === 'string') return 'markdown'
  if (
    props.modelValue !== null &&
    typeof props.modelValue === 'object' &&
    'nodes' in props.modelValue &&
    Array.isArray((props.modelValue as { nodes: unknown }).nodes)
  ) {
    return 'ast'
  }
  return 'json'
})

const placeholder = computed(() => {
  const options =
    typeof props.placeholder === 'string' ? { placeholder: props.placeholder } : props.placeholder
  const { mode: _mode, ...rest } = options || {}
  void _mode
  return defu(rest, { showOnlyWhenEditable: false, showOnlyCurrent: true })
})

const mention = computed(() =>
  defu(typeof props.mention === 'boolean' ? {} : props.mention, {
    HTMLAttributes: { class: 'mention' },
    renderText({ node }: { node: { attrs: Record<string, unknown> } }) {
      return `${node.attrs.mentionSuggestionChar ?? '@'}${node.attrs.label ?? node.attrs.id}`
    },
    renderHTML({
      options,
      node,
    }: {
      options: { HTMLAttributes: Record<string, string> }
      node: { attrs: Record<string, unknown> }
    }) {
      return [
        'span',
        mergeAttributes({ 'data-type': 'mention' }, options.HTMLAttributes),
        `${node.attrs.mentionSuggestionChar ?? '@'}${node.attrs.label ?? node.attrs.id}`,
      ]
    },
  }),
)

// [COMARK] Extra extensions layered on top of ComarkKit. Mention and
// Placeholder don't ship with ComarkKit and don't conflict with it,
// so they ride here just like in stock UEditor. User-supplied
// `:extensions` are appended last.
const extraExtensions = computed<AnyExtension[]>(() => {
  const list: (AnyExtension | false | null | undefined)[] = [
    props.mention !== false && (Mention.configure(mention.value as never) as AnyExtension),
    props.placeholder ? (Placeholder.configure(placeholder.value as never) as AnyExtension) : null,
    ...(props.extensions ?? []),
  ]
  return list.filter((x): x is AnyExtension => !!x)
})

// [COMARK] The single substitution: `useComarkEditor` instead of
// `useEditor` + StarterKit + Markdown + Code + HorizontalRule + Image.
//
// `content` is a one-shot snapshot at setup, NOT a getter. We
// deliberately don't let `useComarkEditor` watch `props.modelValue`,
// because the outer `watch(() => props.modelValue, …)` below is the
// sole reactive sync path — passing a getter would set up a second,
// redundant watcher that races ours and emits stale data on the same
// microtask.
const internal = useComarkEditor({
  content: props.modelValue,
  contentType: contentType.value,
  components: props.components,
  extensions: extraExtensions.value,
  kitOptions: {
    ...props.kitOptions,
    starterKit: props.starterKit ?? {},
  },
  editorOptions: {
    ...rootProps.value,
    editorProps: editorProps.value,
  } as NonNullable<Parameters<typeof useComarkEditor>[0]>['editorOptions'],
})

// v-model emit + shadow loop guard. Mirrors the flow inside our
// `<ComarkEditor>` Vue-layer component but for a single v-model
// (UEditor convention) rather than defineModel + modifiers.
let shadow: string | null = null
const safeJson = (v: unknown): string => {
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

watch(
  internal.editor,
  (e) => {
    if (!e) return
    e.on('update', () => {
      void pushModel(e)
    })
    // Mount-time: only seed the shadow, never emit. In UEditor's
    // single-v-model convention `modelValue` IS the seed, so emitting
    // here would echo the freshly-rendered AST back to the parent and
    // — because Vue batches reactive writes in one microtask — clobber
    // any other write the parent's `onMounted` is doing in the same
    // tick (e.g. restoring from `localStorage`).
    void initShadow(e)
  },
  { immediate: false },
)

async function pushModel(e: Editor): Promise<void> {
  if (contentType.value === 'markdown') {
    try {
      const md = await e.storage.comark.getMarkdown()
      if (md === shadow) return
      shadow = md
      emits('update:modelValue', md)
    } catch {
      /* swallow */
    }
    return
  }
  const out = readByFlavor(e, contentType.value)
  const j = safeJson(out)
  if (j === shadow) return
  shadow = j
  emits('update:modelValue', out as ContentValue)
}

async function initShadow(e: Editor): Promise<void> {
  if (contentType.value === 'markdown') {
    try {
      shadow = await e.storage.comark.getMarkdown()
    } catch {
      shadow = null
    }
    return
  }
  shadow = safeJson(readByFlavor(e, contentType.value))
}

function readByFlavor(e: Editor, ct: ContentType): unknown {
  switch (ct) {
    case 'ast':
      return e.storage.comark.getAst()
    case 'html':
      return e.getHTML()
    case 'json':
      return e.getJSON()
    case 'markdown':
      return null
  }
}

// Inbound sync: when `modelValue` changes from above, push it into
// the editor unless the shadow says we already have it.
watch(
  () => props.modelValue,
  (next) => {
    if (next === undefined) return
    if (!internal.editor.value) return
    if (contentType.value === 'markdown' && typeof next === 'string') {
      if (next === shadow) return
      shadow = next
    } else {
      const j = safeJson(next)
      if (j === shadow) return
      shadow = j
    }
    void internal.setContent(next, { contentType: contentType.value })
  },
)

// `editorHandlers` provide — same key/shape UEditor uses, so a future
// `<UEditorMenu>` etc. can read it without changes when this
// component hosts the editor. The `createHandlers()` set is
// schema-agnostic (uses `editor.can()` / `isExtensionAvailable`); it
// gracefully degrades for extensions ComarkKit doesn't ship
// (textAlign, taskList, …).
const handlers = computed(() => ({
  ...createHandlers(),
  ...props.handlers,
}))
provide('editorHandlers', handlers)

const editorRef = computed<Editor | undefined>(() => internal.editor.value)
const isReady = computed<boolean>(() => internal.isReady.value)

defineExpose<ComarkEditorExpose>({
  editor: editorRef as unknown as Editor | undefined,
  isReady: isReady as unknown as boolean,
  setContent: internal.setContent,
  getAst: internal.getAst,
  getMarkdown: internal.getMarkdown,
  getJson: internal.getJson,
  getHtml: internal.getHtml,
})
</script>

<template>
  <Primitive :as="props.as" data-slot="root" :class="ui.root({ class: [props.ui?.root, props.class] })">
    <template v-if="editorRef">
      <slot :editor="editorRef" />

      <EditorContent
        role="presentation"
        :editor="editorRef"
        data-slot="content"
        :class="ui.content({ class: props.ui?.content })"
      />
    </template>
    <slot v-else name="fallback" />
  </Primitive>
</template>
