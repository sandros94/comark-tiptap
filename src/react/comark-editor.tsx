import { useEffect, useRef, type ReactNode } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import {
  readByFlavor,
  safeJson,
  type ComarkErrorHandler,
  type ComarkKitOptions,
  type ContentType,
  type ContentValue,
} from "comark-tiptap";
import { useComarkEditor, type UseComarkEditorOptions } from "./use-comark-editor";
import type { ComarkReactComponentExports } from "./define-component";

export interface ComarkEditorProps {
  /** Pre-built editor for full lifecycle control. Skips the internal one. */
  editor?: Editor;
  /** Controlled content, in `contentType` flavor. Pair with `onChange`. */
  value?: ContentValue;
  /** Non-reactive mount-only seed. `value` wins when both are set. */
  content?: ContentValue;
  /**
   * Flavor for both input parsing and `onChange` output.
   *
   * @default 'markdown'
   */
  contentType?: ContentType;
  /** Fired with the editor's content in `contentType` flavor on every edit. */
  onChange?: (value: ContentValue) => void;
  onReady?: (editor: Editor) => void;
  onUpdate?: (editor: Editor) => void;
  /**
   * Observe async parse / render / AST-JSON failures the kit otherwise
   * swallows to `console.warn`.
   */
  onError?: ComarkErrorHandler;
  components?: ReadonlyArray<ComarkReactComponentExports>;
  extensions?: ReadonlyArray<AnyExtension>;
  kitOptions?: Partial<ComarkKitOptions>;
  editorOptions?: UseComarkEditorOptions["editorOptions"];
  className?: string;
  /** Rendered above the content; a function receives the live editor. */
  children?: ReactNode | ((editor: Editor) => ReactNode);
  /** Rendered while the editor is being created. */
  fallback?: ReactNode;
}

/**
 * `<ComarkEditor>` — a controlled Tiptap editor backed by `ComarkKit`.
 *
 * @example
 * ```tsx
 * const [md, setMd] = useState('# Hi\n')
 * <ComarkEditor value={md} onChange={setMd} contentType="markdown" />
 * ```
 */
export function ComarkEditor(props: ComarkEditorProps): ReactNode {
  /* BYO editor: a thin EditorContent wrapper with no internal editor.
     Branching by component keeps hooks unconditional in the managed path. */
  if (props.editor) {
    return (
      <div data-comark-editor="">
        {renderChildren(props.children, props.editor)}
        <EditorContent
          editor={props.editor}
          className={props.className}
          data-comark-editor-content=""
        />
      </div>
    );
  }
  return <ManagedComarkEditor {...props} />;
}

function ManagedComarkEditor(props: ComarkEditorProps): ReactNode {
  const {
    value,
    content,
    contentType = "markdown",
    onChange,
    onReady,
    onUpdate,
    onError,
    components,
    extensions,
    kitOptions,
    editorOptions,
    className,
    children,
    fallback,
  } = props;

  /* JSON-shadow loop guard: dedupes the onChange echo. Every push (in or out)
     stamps the shadow, so the wave a value update triggers doesn't bounce back. */
  const shadow = useRef<string | null>(null);

  /* `content` wins as the explicit seed; else the controlled value's initial. */
  const seedAtMount = content !== undefined ? content : value;

  const pushValueFromEditor = async (e: Editor): Promise<void> => {
    if (contentType === "markdown") {
      try {
        const md = await e.storage.comark.getMarkdown();
        if (md === shadow.current) return;
        shadow.current = md;
        onChange?.(md);
      } catch (err) {
        /* Keep the editor alive over a render error; surface it if observed. */
        e.storage.comark.onError?.(err, { phase: "render" });
      }
      return;
    }
    const out = readByFlavor(e, contentType);
    const j = safeJson(out);
    if (j === shadow.current) return;
    shadow.current = j;
    onChange?.(out as ContentValue);
  };

  const initShadow = async (e: Editor): Promise<void> => {
    if (contentType === "markdown") {
      try {
        shadow.current = await e.storage.comark.getMarkdown();
      } catch (err) {
        shadow.current = null;
        e.storage.comark.onError?.(err, { phase: "render" });
      }
      return;
    }
    shadow.current = safeJson(readByFlavor(e, contentType));
  };

  const internal = useComarkEditor({
    content: seedAtMount,
    contentType,
    components,
    extensions,
    kitOptions,
    editorOptions,
    onError,
    onCreate: (e) => {
      /* Controlled = an `onChange` is wired up (not "value is defined" —
         `value={undefined}` with an onChange is still controlled, just empty;
         gating on the value would make that editor write-only). Async markdown
         seed isn't applied yet — seed the shadow so the first update syncs;
         a sync cross-flavor seed (`content` set) pushes now. */
      if (onChange) {
        const seedIsAsyncMarkdown = contentType === "markdown" && typeof seedAtMount === "string";
        if (seedIsAsyncMarkdown) void initShadow(e);
        else if (content !== undefined) void pushValueFromEditor(e);
        else void initShadow(e);
      }
      onReady?.(e);
    },
    onUpdate: (e) => {
      onUpdate?.(e);
      if (onChange) void pushValueFromEditor(e);
    },
  });

  const { editor, setContent } = internal;

  /* Outside-in sync: push a changed controlled value into the editor unless
     the shadow says we already have it. Deps are the stable `setContent`
     (memoized on [editor, contentType]) — NOT the `internal` object, which is a
     fresh reference every render and would re-run this effect on every render,
     re-applying a lagging `value` and clobbering in-flight edits. */
  useEffect(() => {
    if (value === undefined || !editor) return;
    if (contentType === "markdown" && typeof value === "string") {
      if (value === shadow.current) return;
      shadow.current = value;
    } else {
      const j = safeJson(value);
      if (j === shadow.current) return;
      shadow.current = j;
    }
    void setContent(value, { contentType });
  }, [value, editor, contentType, setContent]);

  if (!editor) return <div data-comark-editor="">{fallback ?? null}</div>;
  return (
    <div data-comark-editor="">
      {renderChildren(children, editor)}
      <EditorContent editor={editor} className={className} data-comark-editor-content="" />
    </div>
  );
}

function renderChildren(children: ComarkEditorProps["children"], editor: Editor): ReactNode {
  return typeof children === "function" ? children(editor) : (children ?? null);
}
