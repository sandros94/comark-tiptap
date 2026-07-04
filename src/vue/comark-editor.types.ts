import type { Editor } from '@tiptap/vue-3'
import type {
  ComarkErrorHandler,
  ComarkTree,
  ContentType,
  ContentValue,
  JSONContent,
  SetComarkContentOptions,
  SetterInput,
} from 'comark-tiptap'
import type { AnyExtension } from '@tiptap/core'
import type { SetContentOptions, UseComarkEditorOptions } from './use-comark-editor'
import type { ComarkVueComponentExports } from './define-component'

/** Props for `<ComarkEditor>`. */
export interface ComarkEditorProps {
  /**
   * Pre-built editor instance. If supplied, the wrapper does NOT spin
   * up its own — useful when the consumer wants full control over the
   * Tiptap `Editor` lifecycle (e.g. for collaborative setups).
   */
  editor?: Editor

  /**
   * Non-reactive seed. Applied at mount only; later changes are
   * ignored. Use `v-model` for two-way binding instead.
   */
  content?: ContentValue

  /**
   * Default content flavor. Drives the dispatch when no `v-model`
   * modifier is set. Modifiers (`v-model.markdown`, `v-model.html`,
   * `v-model.json`, `v-model.ast`) override this for the bound model.
   *
   * @default 'markdown'
   */
  contentType?: ContentType

  /** User-defined Comark components from `defineComarkVueComponent`. */
  components?: ReadonlyArray<ComarkVueComponentExports>

  /** Additional Tiptap extensions, appended after the kit. */
  extensions?: ReadonlyArray<AnyExtension>

  /** Forwarded to Tiptap's `Editor` constructor. */
  editorOptions?: UseComarkEditorOptions['editorOptions']

  /** Forwarded to `ComarkKit.configure(...)`. */
  kitOptions?: UseComarkEditorOptions['kitOptions']

  /**
   * Observe async parse / render / AST-JSON failures the kit otherwise
   * swallows to `console.warn`.
   */
  onError?: ComarkErrorHandler
}

/**
 * `v-model` modifiers. Each selects the flavor read back into the bound
 * ref: `v-model.markdown` / `.html` / `.json` / `.ast`.
 */
export type ComarkEditorModelModifiers = {
  markdown?: boolean
  html?: boolean
  json?: boolean
  ast?: boolean
}

/** Events emitted by `<ComarkEditor>`. */
export interface ComarkEditorEmits {
  (e: 'update:modelValue', value: ContentValue): void
  (e: 'ready', editor: Editor): void
  (e: 'update', editor: Editor): void
}

/**
 * Instance API exposed by `<ComarkEditor>` (reachable via a template
 * ref). The `setContent` / getter members exist only when the wrapper
 * owns the editor — they're absent when an `:editor` prop is supplied.
 */
export interface ComarkEditorExpose {
  editor: Editor | undefined
  isReady: boolean
  setContent?: (input: SetterInput<ContentValue>, options?: SetContentOptions) => Promise<void>
  getAst?: () => ComarkTree | null
  getMarkdown?: () => Promise<string | null>
  getJson?: () => JSONContent | null
  getHtml?: () => string | null
}

/** Slots for `<ComarkEditor>`. */
export interface ComarkEditorSlots {
  /**
   * Rendered above the Tiptap content. Receives the live editor (when
   * ready) and an `is-ready` flag so callers can render a toolbar that
   * reacts to mark / node activity once the editor exists.
   */
  default(props: { editor: Editor }): unknown
  /**
   * Rendered while the editor is mounting (Tiptap touches the DOM in
   * its constructor, so SSR / pre-mount renders skip the live
   * component). Falls back to nothing if the slot isn't supplied.
   */
  fallback(): unknown
}

// Re-export the `SetComarkContentOptions` type for downstream users.
export type { SetComarkContentOptions }
