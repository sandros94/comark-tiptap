import {
  computed,
  defineComponent,
  h,
  watch,
  type PropType,
  type SlotsType,
  type VNodeArrayChildren,
  type VNodeChild,
} from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import type { AnyExtension } from '@tiptap/core'
import type { ContentType, ContentValue } from 'comark-tiptap'
import { useComarkEditor, type UseComarkEditorOptions } from './use-comark-editor'
import type { ComarkEditorProps, ComarkEditorSlots } from './comark-editor.types'
import type { ComarkVueComponentExports } from './define-component'

/**
 * `<ComarkEditor>` — thin wrapper over `@tiptap/vue-3`'s `EditorContent`.
 *
 * Pass a pre-built editor (`:editor`) for full lifecycle control, or rely
 * on the built-in `useComarkEditor` via `v-model` / `:content`.
 *
 * One `v-model` surface; modifiers pick the flavor read back to the ref:
 * `v-model.markdown` / `.html` / `.json` / `.ast`. INPUT flavor (parsing
 * `:content`) comes from the `contentType` prop (default `'markdown'`);
 * when only `v-model` is bound the modifier drives both directions.
 *
 * @example
 * ```vue
 * <ComarkEditor v-model.ast="tree" :components="[Alert]" />
 * ```
 */
export const ComarkEditor = defineComponent({
  name: 'ComarkEditor',
  inheritAttrs: false,

  props: {
    editor: { type: Object as PropType<Editor>, default: undefined },
    content: {
      type: [Object, String, Array] as PropType<ComarkEditorProps['content']>,
      default: undefined,
    },
    contentType: { type: String as PropType<ContentType>, default: undefined },
    components: {
      type: Array as PropType<ReadonlyArray<ComarkVueComponentExports>>,
      default: undefined,
    },
    extensions: { type: Array as PropType<ReadonlyArray<AnyExtension>>, default: undefined },
    editorOptions: {
      type: Object as PropType<UseComarkEditorOptions['editorOptions']>,
      default: undefined,
    },
    kitOptions: {
      type: Object as PropType<UseComarkEditorOptions['kitOptions']>,
      default: undefined,
    },
    // v-model plumbing (defineModel expands to these at compile time).
    modelValue: {
      type: [Object, String, Array] as PropType<ContentValue>,
      default: undefined,
    },
    modelModifiers: {
      type: Object as PropType<Partial<Record<ContentType, boolean>>>,
      default: () => ({}),
    },
  },

  emits: {
    'update:modelValue': (_value: ContentValue) => true,
    'ready': (_editor: Editor) => true,
    'update': (_editor: Editor) => true,
  },

  slots: Object as SlotsType<ComarkEditorSlots>,

  setup(props, { emit, slots, attrs, expose }) {
    /*
     * v-model surface: the bound ref always holds the OUTPUT flavor (the
     * modifier). Reads go through `props.modelValue`; writes emit
     * `update:modelValue` — the shadow guard below stops the echo.
     */
    const modelValue = (): ContentValue | undefined => props.modelValue
    const setModel = (value: ContentValue): void => emit('update:modelValue', value)

    function pickModifier(): ContentType | null {
      const m = props.modelModifiers
      if (m.html) return 'html'
      if (m.json) return 'json'
      if (m.ast) return 'ast'
      if (m.markdown) return 'markdown'
      return null
    }

    /*
     * OUTPUT flavor: drives the v-model emit and the outside-in watcher.
     * The bound model is always this flavor in both directions.
     */
    const outputFlavor = computed<ContentType>(
      () => pickModifier() ?? props.contentType ?? 'markdown',
    )

    /*
     * INPUT flavor: how the seed is parsed. With `:content`, the
     * `contentType` prop decides; otherwise fall back to the modifier so
     * the seed matches the v-model's flavor.
     */
    const inputFlavor = computed<ContentType>(() => {
      if (props.content !== undefined) return props.contentType ?? 'markdown'
      return pickModifier() ?? props.contentType ?? 'markdown'
    })

    /*
     * JSON-shadow loop guard: dedupes the v-model echo. Every push (in or
     * out) stamps the shadow, so the push v-model triggers doesn't bounce
     * back as a fresh emit.
     */
    let shadow: string | null = null
    const safeJson = (v: unknown): string => {
      try {
        return JSON.stringify(v)
      } catch {
        return ''
      }
    }

    // Seed: `:content` wins (explicit input); else v-model's initial value.
    const seedAtMount: ContentValue | undefined =
      props.content !== undefined ? props.content : modelValue()

    const internal = props.editor
      ? null
      : useComarkEditor({
          content: seedAtMount,
          contentType: inputFlavor.value,
          components: props.components,
          extensions: props.extensions,
          kitOptions: props.kitOptions,
          editorOptions: props.editorOptions,
          onCreate: (e) => {
            /*
             * Initial v-model sync, two paths due to the markdown
             * async-parse hop:
             *   - Sync seed (html/json/ast/non-string markdown): editor
             *     state is final by `onCreate`, so push to the model now.
             *   - Async markdown string: editor is empty for one
             *     microtask, so seed the shadow and let the first
             *     `onUpdate` do the sync.
             */
            if (modelValue() !== undefined) {
              const seedIsAsyncMarkdown =
                inputFlavor.value === 'markdown' && typeof seedAtMount === 'string'
              if (seedIsAsyncMarkdown) {
                void initShadow(e)
              } else if (props.content !== undefined) {
                void pushModelFromEditor(e)
              } else {
                void initShadow(e)
              }
            }
            emit('ready', e)
          },
          onUpdate: (e) => {
            emit('update', e)
            if (modelValue() === undefined) return
            void pushModelFromEditor(e)
          },
        })

    // Read the editor in the output flavor and push to v-model (shadow-guarded).
    async function pushModelFromEditor(e: Editor): Promise<void> {
      if (outputFlavor.value === 'markdown') {
        try {
          const md = await e.storage.comark.getMarkdown()
          if (md === shadow) return
          shadow = md
          setModel(md)
        } catch {
          // Swallow: keeping the editor alive beats surfacing a render error here.
        }
        return
      }
      const out = readByFlavor(e, outputFlavor.value)
      const j = safeJson(out)
      if (j === shadow) return
      shadow = j
      setModel(out as ContentValue)
    }

    // Seed the shadow without touching the model.
    async function initShadow(e: Editor): Promise<void> {
      if (outputFlavor.value === 'markdown') {
        try {
          shadow = await e.storage.comark.getMarkdown()
        } catch {
          shadow = null
        }
        return
      }
      shadow = safeJson(readByFlavor(e, outputFlavor.value))
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
          // markdown is async; handled by the caller separately.
          return null
      }
    }

    /*
     * Outside-in sync: when the bound model changes from above, push it
     * into the editor unless the shadow says we already have it. The model
     * is always in the OUTPUT flavor (= modifier).
     */
    watch(
      () => props.modelValue,
      (next) => {
        if (next === undefined) return
        if (!internal) return
        if (outputFlavor.value === 'markdown' && typeof next === 'string') {
          if (next === shadow) return
          shadow = next
        } else {
          const j = safeJson(next)
          if (j === shadow) return
          shadow = j
        }
        void internal.setContent(next, { contentType: outputFlavor.value })
      },
    )

    const editorRef = computed<Editor | undefined>(() => props.editor ?? internal?.editor.value)
    const isReady = computed(() => editorRef.value !== undefined)

    expose({
      editor: editorRef,
      isReady,
      setContent: internal?.setContent,
      getAst: internal?.getAst,
      getMarkdown: internal?.getMarkdown,
      getJson: internal?.getJson,
      getHtml: internal?.getHtml,
    })

    return () => {
      const editor = editorRef.value
      const children: VNodeArrayChildren = editor
        ? [
            slots.default?.({ editor }) as VNodeChild,
            h(EditorContent, {
              editor,
              'data-comark-editor-content': '',
              ...attrs,
            }),
          ]
        : [slots.fallback?.() as VNodeChild]
      return h('div', { 'data-comark-editor': '' }, children)
    }
  },
})

export default ComarkEditor
