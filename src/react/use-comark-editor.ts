import { useCallback, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { AnyExtension, Content, EditorOptions } from "@tiptap/core";
import {
  applyContent,
  ComarkKit,
  isComarkTreeLike,
  readByFlavor,
  type ComarkErrorHandler,
  type ComarkKitOptions,
  type ComarkTree,
  type ContentType,
  type ContentValue,
  type JSONContent,
  type SetComarkContentOptions,
  type SetterContext,
  type SetterInput,
} from "comark-tiptap";
import type { ComarkReactComponentExports } from "./define-component";

export interface UseComarkEditorOptions {
  /** Mount-only seed. Live updates flow through `<ComarkEditor value>` instead. */
  content?: ContentValue;
  /** @default 'markdown' */
  contentType?: ContentType;
  /** User components from {@link defineComarkReactComponent}. */
  components?: ReadonlyArray<ComarkReactComponentExports>;
  /** Extra Tiptap extensions, appended after the kit. */
  extensions?: ReadonlyArray<AnyExtension>;
  /** Forwarded to `ComarkKit.configure(...)`. */
  kitOptions?: Partial<ComarkKitOptions>;
  /** Forwarded to Tiptap's `Editor`; schema/content/lifecycle are managed here. */
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
  onCreate?: (editor: Editor) => void;
  onUpdate?: (editor: Editor) => void;
  onDestroy?: () => void;
}

export interface SetContentOptions extends SetComarkContentOptions {
  /** Override the hook-level `contentType` for this call. */
  contentType?: ContentType;
}

export interface UseComarkEditorReturn {
  /** Tiptap editor instance; `null` until created. */
  editor: Editor | null;
  isReady: boolean;
  /** Replace content; routes by `contentType`. Accepts a value or a functional updater. */
  setContent: (input: SetterInput<ContentValue>, options?: SetContentOptions) => Promise<void>;
  getAst: () => ComarkTree | null;
  getMarkdown: () => Promise<string | null>;
  getJson: () => JSONContent | null;
  getHtml: () => string | null;
}

const DEFAULT_CONTENT_TYPE: ContentType = "markdown";

/**
 * React hook returning a Tiptap `Editor` pre-configured with `ComarkKit`,
 * plus a single `setContent` setter and flavor getters.
 *
 * @example
 * ```tsx
 * const { editor, getAst, getMarkdown } = useComarkEditor({ content: '# Hi', contentType: 'markdown' })
 * ```
 */
export function useComarkEditor(options: UseComarkEditorOptions = {}): UseComarkEditorReturn {
  /* Schema-shaping options are read once at mount, mirroring the Vue binding. */
  const init = useRef(options).current;
  const contentType = init.contentType ?? DEFAULT_CONTENT_TYPE;

  /* Latest lifecycle callbacks, so the mount-time editor options don't capture
     stale closures across re-renders. */
  const cbs = useRef({
    onCreate: options.onCreate,
    onUpdate: options.onUpdate,
    onDestroy: options.onDestroy,
  });
  cbs.current = {
    onCreate: options.onCreate,
    onUpdate: options.onUpdate,
    onDestroy: options.onDestroy,
  };

  const mergedComponents = [
    ...(init.components ?? []),
    ...((init.kitOptions?.components as ReadonlyArray<ComarkReactComponentExports> | undefined) ??
      []),
  ];
  /* Route the hook-level onError into the serializer so core parse failures
     reach it too; a kitOptions.serializer.onError still wins. */
  const serializer =
    init.onError !== undefined
      ? { onError: init.onError, ...init.kitOptions?.serializer }
      : init.kitOptions?.serializer;
  const allExtensions: AnyExtension[] = [
    ComarkKit.configure({
      ...init.kitOptions,
      ...(serializer ? { serializer } : {}),
      components: mergedComponents,
    }),
    ...(init.extensions ?? []),
  ];

  const initialValue = init.content;
  /* AST seeds (contentType 'ast', or an auto-detected ComarkTree) can't pass
     through Tiptap's constructor — apply them via setComarkAst in onCreate. */
  const useAstSeed =
    initialValue !== undefined && (contentType === "ast" || isComarkTreeLike(initialValue));
  const tiptapContent: Content | undefined = useAstSeed
    ? undefined
    : ((initialValue as Content | undefined) ?? undefined);
  const tiptapContentType: "markdown" | "html" | "json" | undefined =
    initialValue === undefined || useAstSeed
      ? undefined
      : (contentType as "markdown" | "html" | "json");

  const editor = useEditor(
    {
      ...init.editorOptions,
      extensions: allExtensions,
      content: tiptapContent,
      ...(tiptapContentType ? { contentType: tiptapContentType } : {}),
      onCreate({ editor: e }) {
        if (useAstSeed) {
          e.commands.setComarkAst(initialValue as ComarkTree | string, { emitUpdate: false });
        }
        cbs.current.onCreate?.(e as Editor);
      },
      onUpdate({ editor: e }) {
        cbs.current.onUpdate?.(e as Editor);
      },
      onDestroy() {
        cbs.current.onDestroy?.();
      },
    },
    [],
  );

  const setContent = useCallback(
    async (
      input: SetterInput<ContentValue>,
      callOptions: SetContentOptions = {},
    ): Promise<void> => {
      if (!editor) return;
      const ct = callOptions.contentType ?? contentType;
      let next: ContentValue;
      if (typeof input === "function") {
        const current =
          ct === "markdown"
            ? ((await editor.storage.comark.getMarkdown()) as ContentValue)
            : (readByFlavor(editor, ct) as ContentValue);
        next = await (
          input as (ctx: SetterContext<ContentValue>) => ContentValue | Promise<ContentValue>
        )({ content: current, editor });
      } else {
        next = input;
      }
      applyContent(editor, next, ct, callOptions);
    },
    [editor, contentType],
  );

  const getAst = useCallback(
    (): ComarkTree | null => editor?.storage.comark.getAst() ?? null,
    [editor],
  );
  const getMarkdown = useCallback(
    (): Promise<string | null> => editor?.storage.comark.getMarkdown() ?? Promise.resolve(null),
    [editor],
  );
  const getJson = useCallback(
    (): JSONContent | null => (editor?.getJSON() as JSONContent | undefined) ?? null,
    [editor],
  );
  const getHtml = useCallback((): string | null => editor?.getHTML() ?? null, [editor]);

  return { editor, isReady: editor !== null, setContent, getAst, getMarkdown, getJson, getHtml };
}
