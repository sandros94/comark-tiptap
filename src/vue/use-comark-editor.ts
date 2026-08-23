import type { AnyExtension, Content, EditorOptions } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Editor } from "@tiptap/vue-3";
import {
  ComarkKit,
  type ComarkErrorHandler,
  type ComarkKitOptions,
  type ComarkStreamSession,
  type MarkdownDocument,
  type ContentType,
  type ContentValue,
  type JSONContent,
  type SetterContext,
  type SetterInput,
} from "comark-tiptap";
import {
  applyContent,
  isMarkdownDocumentLike,
  readByFlavor,
  type SetContentCallOptions,
} from "comark-tiptap/internal";
import {
  computed,
  isRef,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef,
} from "vue";
import type { ComarkVueComponentExports } from "./define-component";

/** Options for {@link useComarkEditor}. */
export interface UseComarkEditorOptions {
  /**
   * Initial / reactive document. Resolved through Vue's `toValue` —
   * pass a `Ref<T>` or `() => T` for live binding (changes propagate
   * into the editor), or a plain value for a one-shot mount-time seed.
   *
   * Object inputs are auto-detected on bare `setContent` (`MarkdownDocument`
   * shapes route through `setComarkAst`); string inputs follow
   * `contentType`.
   */
  content?: MaybeRefOrGetter<ContentValue | undefined>;

  /**
   * Flavor of the bound `content`. Drives both input dispatch (which
   * underlying command runs) and the output flavor used by
   * `<ComarkEditor>` for emit.
   *
   * @default 'markdown'
   */
  contentType?: ContentType;

  /**
   * While true, the editor is read-only and reactive `content` STRINGS are
   * fed to a stream session (`editor.storage.comark.stream()`) instead of
   * being applied normally — each value is the full accumulated markdown
   * snapshot. Flipping back to false finalizes the session (canonical
   * re-parse) and restores editability.
   *
   * Non-string `content` values are ignored while streaming, and streamed
   * text is never echoed back to the bound model. `setContent()` bypasses
   * the session by design.
   *
   * @default false
   */
  streaming?: MaybeRefOrGetter<boolean>;

  /** User-defined Comark components (block or inline). Read once at mount. */
  components?: ReadonlyArray<ComarkVueComponentExports>;

  /** Additional Tiptap extensions, appended after the kit. Read once at mount. */
  extensions?: ReadonlyArray<AnyExtension>;

  /**
   * Forwarded to `ComarkKit.configure(...)`. Use this to tweak
   * StarterKit (`{ starterKit: { heading: false } }`), tables
   * (`{ table: false }`), images, the serializer's `injectStyles`
   * setting, etc.
   *
   * `components` from this object is merged with the top-level
   * `components` option for convenience.
   */
  kitOptions?: Partial<ComarkKitOptions>;

  /**
   * Forwarded to Tiptap's `Editor` constructor. Use it for
   * `editorProps`, `editable`, `injectCSS`, custom `parseOptions`, etc.
   * Schema-related options (extensions, content) and lifecycle hooks
   * (onCreate / onUpdate / onDestroy) are managed by this composable.
   */
  editorOptions?: Omit<
    Partial<EditorOptions>,
    "extensions" | "content" | "onCreate" | "onUpdate" | "onDestroy"
  >;

  /**
   * Observe async parse / render / AST-JSON failures the kit otherwise
   * swallows to `console.warn`. Forwarded to `ComarkKit`'s serializer;
   * also fires for the wrapper's own markdown-render failures.
   */
  onError?: ComarkErrorHandler;

  /** Called once when the editor instance has been created. */
  onCreate?: (editor: Editor) => void;
  /**
   * Called on every transaction that changes the document. Receives the
   * editor plus the update event's transaction (`getMeta` readable).
   */
  onUpdate?: (editor: Editor, transaction: Transaction) => void;
  /** Called when the editor instance is being destroyed. */
  onDestroy?: () => void;
}

/** Per-call options for `setContent` — the shape shared between frameworks. */
export type { SetContentCallOptions };

/** @deprecated Renamed to {@link SetContentCallOptions} */
export type SetContentOptions = SetContentCallOptions;

/** Return value of {@link useComarkEditor}. */
export interface UseComarkEditorReturn {
  /** Tiptap editor instance. `undefined` until mount. */
  editor: ShallowRef<Editor | undefined>;
  /** True once the editor instance is constructed. */
  isReady: ComputedRef<boolean>;

  /**
   * Replace content. Routes by `contentType` (option-level default,
   * overridable per call). Accepts either a value or a functional
   * updater that receives the current content in the matching flavor.
   *
   * Returns a `Promise<void>` because the markdown path is async; for
   * other flavors the promise resolves on the same microtask.
   */
  setContent: (input: SetterInput<ContentValue>, options?: SetContentCallOptions) => Promise<void>;

  /** Read the current state in any flavor. Returns `null` until ready. */
  getAst: () => MarkdownDocument | null;
  getMarkdown: () => Promise<string | null>;
  getJson: () => JSONContent | null;
  /**
   * Read the current state as HTML — pure pass-through to Tiptap's
   * `editor.getHTML()`. NOTE: components that ship a framework-rendered
   * NodeView (e.g. `defineComarkVueComponent({ nodeView })`) emit only
   * the generic `<div data-comark-component="...">` marker here, not
   * the framework-rendered output. For lossless export prefer
   * `getMarkdown()` or `getAst()`.
   */
  getHtml: () => string | null;
}

const DEFAULT_CONTENT_TYPE: ContentType = "markdown";

/**
 * Create and manage a Comark-configured Tiptap editor inside a Vue
 * setup scope. Builds `ComarkKit` (plus any extra `extensions` /
 * `components`), constructs the `Editor` on mount, and destroys it on
 * unmount.
 *
 * @param options - See {@link UseComarkEditorOptions}.
 * @returns The editor ref, a readiness flag, `setContent`, and
 * per-flavor getters. See {@link UseComarkEditorReturn}.
 *
 * @example
 * ```ts
 * const md = ref('# Hello')
 * const { editor, setContent, getMarkdown } = useComarkEditor({
 *   content: md,
 *   contentType: 'markdown',
 * })
 * ```
 */
export function useComarkEditor(options: UseComarkEditorOptions = {}): UseComarkEditorReturn {
  const {
    content,
    contentType = DEFAULT_CONTENT_TYPE,
    streaming,
    components = [],
    extensions = [],
    kitOptions,
    editorOptions,
    onError,
    onCreate,
    onUpdate,
    onDestroy,
  } = options;

  const editor = shallowRef<Editor | undefined>(undefined);
  /** Live while `streaming` is true; bound string content routes into it. */
  let session: ComarkStreamSession | null = null;

  const mergedComponents = [
    ...components,
    ...((kitOptions?.components as ReadonlyArray<ComarkVueComponentExports> | undefined) ?? []),
  ];
  /* Route the composable-level onError into the serializer so core parse
     failures reach it too; a kitOptions.serializer.onError still wins. */
  const serializer =
    onError !== undefined ? { onError, ...kitOptions?.serializer } : kitOptions?.serializer;
  const allExtensions: AnyExtension[] = [
    ComarkKit.configure({
      ...kitOptions,
      ...(serializer ? { serializer } : {}),
      components: mergedComponents,
    }),
    ...extensions,
  ];

  /*
   * Resolve the initial seed once — a snapshot, not a reactive getter.
   * Reactive sources are watched post-mount; this captures the value at
   * construction time.
   */
  const initialValue = toValue(content);

  /*
   * Decide whether the seed flows through Tiptap's constructor or via a
   * separate `setComarkAst` call after mount. Two cases need the
   * explicit-AST path:
   *   - `contentType: 'ast'` (object or JSON-encoded string): Tiptap's
   *     `contentType` enum has no `'ast'`, so the constructor would error
   *     or misread it as markdown.
   *   - object input auto-detected as a `MarkdownDocument`: not a shape the
   *     constructor can consume.
   */
  const useAstSeed =
    initialValue !== undefined && (contentType === "ast" || isMarkdownDocumentLike(initialValue));

  const tiptapContent: Content | undefined = useAstSeed
    ? undefined
    : ((initialValue as Content | undefined) ?? undefined);

  const tiptapContentType: "markdown" | "html" | "json" | undefined =
    initialValue === undefined || useAstSeed
      ? undefined
      : (contentType as "markdown" | "html" | "json");

  // Tiptap touches the DOM during construction — defer to client mount.
  onMounted(() => {
    const instance = new Editor({
      ...editorOptions,
      extensions: allExtensions,
      content: tiptapContent,
      /*
       * The serializer's `onBeforeCreate` reads
       * `editor.options.contentType` and dispatches per branch. Forward
       * our flavor except for 'ast' (handled below) and the no-seed case.
       */
      ...(tiptapContentType ? { contentType: tiptapContentType } : {}),
      onCreate({ editor: e }) {
        onCreate?.(e as Editor);
      },
      onUpdate({ editor: e, transaction }) {
        onUpdate?.(e as Editor, transaction);
      },
      onDestroy() {
        onDestroy?.();
      },
    });

    /*
     * Apply a Comark AST (object or JSON-encoded string) synchronously,
     * BEFORE assigning `editor.value`, to avoid a race. Two reasons:
     *   1. Tiptap dispatches its `create` event asynchronously
     *      (`setTimeout(0)` in the constructor), so applying content from
     *      `onCreate` would land after the consumer's `onMounted` and
     *      race any prop-driven setter it kicks off there.
     *   2. `emitUpdate: false` keeps the seed from firing the consumer's
     *      `onUpdate`. `<ComarkEditor>` runs its own initial v-model sync
     *      via `onCreate` since it can't rely on `update` here.
     */
    if (
      initialValue !== undefined &&
      (contentType === "ast" || isMarkdownDocumentLike(initialValue))
    ) {
      instance.commands.setComarkAst(initialValue as MarkdownDocument | string, {
        emitUpdate: false,
      });
    }

    editor.value = instance;

    /*
     * Streaming: the rising edge opens a session (taking the editor
     * read-only), the falling edge finalizes it. `immediate` covers
     * `streaming` already being true at mount. Wired BEFORE the content
     * watcher so a same-tick flip is visible to the routing below.
     * Editor destroy auto-aborts, so there's nothing to clean up.
     */
    watch(
      () => toValue(streaming) === true,
      (on) => {
        if (on) session = instance.storage.comark.stream();
        else {
          void session?.end();
          session = null;
        }
      },
      { immediate: true },
    );

    /*
     * Reactive content: watch for outer changes and push them in. Plain
     * values are seeded at mount and never re-applied, so only wire the
     * watcher when the source is actually reactive.
     */
    if (isRef(content) || typeof content === "function") {
      watch(
        () => toValue(content as MaybeRefOrGetter<ContentValue | undefined>),
        (next) => {
          if (next === undefined) return;
          if (instance.isDestroyed) return;
          /* Streaming: strings are snapshots for the session; other flavors
             have no incremental form, so they're ignored until it ends. */
          if (session?.active) {
            if (typeof next === "string") session.set(next);
            return;
          }
          applyContent(instance, next, contentType);
        },
      );
    }
  });

  onBeforeUnmount(() => {
    editor.value?.destroy();
  });

  // Imperative setter — accepts a value or a functional updater.
  const setContent = async (
    input: SetterInput<ContentValue>,
    callOptions: SetContentCallOptions = {},
  ): Promise<void> => {
    const e = editor.value;
    if (!e) return;
    const ct = callOptions.contentType ?? contentType;
    let next: ContentValue;
    if (typeof input === "function") {
      const current =
        ct === "markdown"
          ? ((await e.storage.comark.getMarkdown()) as ContentValue)
          : (readByFlavor(e, ct) as ContentValue);
      next = await (
        input as (ctx: SetterContext<ContentValue>) => ContentValue | Promise<ContentValue>
      )({
        content: current,
        editor: e,
      });
    } else {
      next = input;
    }
    applyContent(e, next, ct, callOptions);
  };

  // Getters

  const getAst = (): MarkdownDocument | null => editor.value?.storage.comark.getAst() ?? null;
  const getMarkdown = (): Promise<string | null> =>
    editor.value?.storage.comark.getMarkdown() ?? Promise.resolve(null);
  const getJson = (): JSONContent | null =>
    (editor.value?.getJSON() as JSONContent | undefined) ?? null;
  const getHtml = (): string | null => editor.value?.getHTML() ?? null;

  const isReady = computed(() => editor.value !== undefined);

  return {
    editor,
    isReady,
    setContent,
    getAst,
    getMarkdown,
    getJson,
    getHtml,
  };
}
