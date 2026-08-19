import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import type {
  ComarkErrorHandler,
  ComarkKitOptions,
  ContentType,
  ContentValue,
} from "comark-tiptap";
import {
  createPushScheduler,
  MODEL_APPLY_META,
  readByFlavor,
  safeJson,
} from "comark-tiptap/internal";
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
  onUpdate?: (editor: Editor, transaction: Transaction) => void;
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
  /*
   * BYO is opt-in by PASSING the `editor` prop — key by its presence, not its
   * current truthiness. `useEditor`/`useComarkEditor` return `null` on the
   * first render, so `<ComarkEditor editor={hook.editor} />` starts with
   * `editor === undefined`; branching on truthiness would fall into managed
   * mode, spin up (then immediately destroy) a throwaway internal editor when
   * the real one resolves a tick later. Branching on presence keeps the
   * component type stable across that null→ready transition, so no internal
   * editor is ever created in BYO mode.
   *
   * Each branch is its own component, so hooks stay unconditional within each.
   */
  if ("editor" in props) {
    return <ByoComarkEditor {...props} />;
  }
  return <ManagedComarkEditor {...props} />;
}

/** BYO branch: renders the caller's editor, or the fallback until it resolves. */
function ByoComarkEditor(props: ComarkEditorProps): ReactNode {
  const { editor, children, className, fallback } = props;
  if (!editor) return <div data-comark-editor="">{fallback ?? null}</div>;
  return (
    <div data-comark-editor="">
      {renderChildren(children, editor)}
      <EditorContent editor={editor} className={className} data-comark-editor-content="" />
    </div>
  );
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

  /* Push scheduling: a burst of updates in one task collapses into a single
     serialize+emit on the next microtask, reading the editor's latest state.
     The sequence invalidates in-flight async (markdown) renders — every
     doc-changing update and every outside-in apply bumps it, so a render that
     resolves after a newer one started is dropped instead of emitted. Every
     async resume re-checks BOTH the sequence and `isDestroyed`: a fast unmount
     (or StrictMode's double-invoke) can land while a render is still pending.
     Lazy `useState` init, so the instance is stable across re-renders. */
  const [pushScheduler] = useState(createPushScheduler);

  /* `content` wins as the explicit seed; else the controlled value's initial. */
  const seedAtMount = content !== undefined ? content : value;

  const pushValueFromEditor = async (e: Editor): Promise<void> => {
    if (e.isDestroyed) return;
    if (contentType === "markdown") {
      const seq = pushScheduler.capture();
      try {
        const md = await e.storage.comark.getMarkdown();
        if (e.isDestroyed || !pushScheduler.isCurrent(seq)) return;
        if (md === shadow.current) return;
        shadow.current = md;
        onChange?.(md);
      } catch (err) {
        if (e.isDestroyed || !pushScheduler.isCurrent(seq)) return;
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
      const seq = pushScheduler.capture();
      try {
        const md = await e.storage.comark.getMarkdown();
        if (e.isDestroyed || !pushScheduler.isCurrent(seq)) return;
        shadow.current = md;
      } catch (err) {
        if (e.isDestroyed || !pushScheduler.isCurrent(seq)) return;
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
    onUpdate: (e, transaction) => {
      onUpdate?.(e, transaction);
      if (!onChange) return;
      pushScheduler.bump();
      /* Echo of a value the effect just applied — the controlled value already
         holds it, so skip the serialize-and-compare entirely. */
      if (transaction.getMeta(MODEL_APPLY_META)) return;
      pushScheduler.schedule(() => void pushValueFromEditor(e));
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
    /* Bump before applying: a render still in flight describes a state older
       than the value being pushed in and must not clobber it. */
    pushScheduler.bump();
    void setContent(value, { contentType, transactionMeta: { [MODEL_APPLY_META]: true } });
  }, [value, editor, contentType, setContent, pushScheduler]);

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
