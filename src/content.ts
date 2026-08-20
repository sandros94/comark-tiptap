import type { Content, Editor } from "@tiptap/core";
import type { SetComarkContentOptions } from "./serializer";
import type { MarkdownDocument, ContentType, ContentValue, JSONContent } from "./types";

/*
 * Content-routing helpers shared by the serializer and the framework bindings.
 * Everything here is `@internal`: the bindings import these by package name to
 * avoid re-implementing dispatch/read logic per framework, but the surface is
 * not part of the semver-supported public API.
 */

/**
 * Structural check for a `MarkdownDocument` — an object carrying a `nodes` array.
 * Routes object content to the AST path.
 *
 * @internal
 */
export function isMarkdownDocumentLike(v: unknown): v is MarkdownDocument {
  return (
    !!v &&
    typeof v === "object" &&
    "nodes" in (v as Record<string, unknown>) &&
    Array.isArray((v as { nodes: unknown }).nodes)
  );
}

/**
 * Transaction-meta key the bindings stamp on outside-in model applies, so
 * their `onUpdate` can skip re-serializing a value they just applied.
 *
 * @internal
 */
export const MODEL_APPLY_META = "comarkModelApply";

/**
 * Per-call options for the bindings' `setContent`: the serializer call options
 * plus a one-shot `contentType` override — useful in toolbars that need to set
 * HTML for one paste handler while the bound model stays in markdown, etc.
 */
export interface SetContentCallOptions extends SetComarkContentOptions {
  /** Override the binding-level `contentType` for this single call. */
  contentType?: ContentType;
}

/**
 * Apply a content value with the command matching its flavor. Markdown strings
 * go async (`setComarkMarkdown`); an object with a `'markdown'` flavor falls
 * through to `setContent`, which auto-detects `MarkdownDocument` vs PM JSON.
 *
 * @internal
 */
export function applyContent(
  editor: Editor,
  value: ContentValue,
  contentType: ContentType,
  options: SetComarkContentOptions = {},
): void {
  const baseOpts = {
    emitUpdate: options.emitUpdate ?? true,
    errorOnInvalidContent: options.errorOnInvalidContent,
    transactionMeta: options.transactionMeta,
  };
  switch (contentType) {
    case "ast":
      editor.commands.setComarkAst(value as MarkdownDocument | string, baseOpts);
      return;
    case "markdown":
      if (typeof value === "string") editor.commands.setComarkMarkdown(value, baseOpts);
      else editor.commands.setContent(value as Content, baseOpts);
      return;
    case "html":
      editor.commands.setContent(value as Content, { ...baseOpts, contentType: "html" });
      return;
    case "json":
      editor.commands.setContent(value as Content, { ...baseOpts, contentType: "json" });
      return;
  }
}

/**
 * Read the editor's current content in a sync flavor. Markdown is async and
 * returns `null` here — read it via `editor.storage.comark.getMarkdown()`.
 *
 * @internal
 */
export function readByFlavor(editor: Editor, contentType: ContentType): ContentValue | null {
  switch (contentType) {
    case "ast":
      return editor.storage.comark.getAst();
    case "html":
      return editor.getHTML();
    case "json":
      return editor.getJSON() as JSONContent;
    case "markdown":
      return null;
  }
}

/**
 * Coalesce-and-invalidate scheduler behind the bindings' model pushes.
 *
 * @internal
 */
export interface PushScheduler {
  /** Invalidate in-flight async work: every sequence captured so far goes stale. */
  bump(): void;
  /** Run `flush` on the next microtask, collapsing a burst of calls into one. */
  schedule(flush: () => void): void;
  /** Take the current sequence, to be re-checked after an `await`. */
  capture(): number;
  /** Whether a captured sequence still describes the latest state. */
  isCurrent(seq: number): boolean;
}

/**
 * Build a {@link PushScheduler}: `schedule` collapses a burst of pushes into
 * one flush on the next microtask (which reads the editor's latest state, so
 * only the first closure of a window is kept), while `bump` invalidates
 * in-flight async renders so a stale resume drops itself via
 * `capture` / `isCurrent`.
 *
 * @internal
 */
export function createPushScheduler(): PushScheduler {
  let queued = false;
  let seq = 0;
  return {
    bump: () => {
      seq++;
    },
    schedule: (flush) => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        flush();
      });
    },
    capture: () => seq,
    isCurrent: (captured) => captured === seq,
  };
}

/**
 * `JSON.stringify` that never throws — the binding shadow guard stamps this to
 * dedupe the model↔editor echo, and a cyclic value must not crash the guard.
 *
 * @internal
 */
export function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}
