import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createMarkdownParser, parseMarkdown, type ParserOptions } from "comark";
import { MODEL_APPLY_META } from "./content";
import type { ComarkParserOptions, ComarkSerializerStorage } from "./serializer";
import type { JSONContent, MarkdownDocument } from "./types";

/**
 * Imperative handle for progressively rendering model-produced markdown into an
 * editor. Obtained from `editor.storage.comark.stream()`.
 */
export interface ComarkStreamSession {
  /** Feed the full accumulated markdown snapshot; applies are frame-coalesced. */
  set(markdown: string): void;
  /** Flush, re-parse canonically, apply the correction, restore editability. */
  end(): Promise<void>;
  /** Drop pending work and restore editability; the doc keeps the last applied state. */
  abort(): void;
  /** False after `end()` / `abort()` / editor destroy. */
  readonly active: boolean;
}

/**
 * Everything a session needs from the serializer extension.
 *
 * @internal
 */
export interface StreamSessionContext {
  editor: Editor;
  /** Serializer storage — the session writes `frontmatter` / `meta` on each tick. */
  storage: ComarkSerializerStorage;
  /** Consumer parse options; the session layers its streaming invariants on top. */
  parserOptions: ComarkParserOptions | undefined;
  /** Serializer-resolved (non-streaming) options for the `end()` re-parse. */
  canonicalOptions: ParserOptions;
  /** Comark tree → PM doc JSON through the registered specs, pruned to the schema. */
  toPmDoc: (tree: MarkdownDocument) => JSONContent;
  /** Route a swallowed failure to the consumer handler under the `"stream"` phase. */
  report: (error: unknown) => void;
}

/**
 * Start a stream session on `editor`.
 *
 * The session owns ONE comark streaming parser for its whole lifetime — the
 * trees it returns are that parser's incremental cache and must never be
 * mutated (their `$` markers anchor the next tick's node reuse).
 *
 * @internal
 */
export function createStreamSession(ctx: StreamSessionContext): ComarkStreamSession {
  const { editor, storage } = ctx;
  /* `headingIds` is a serializer invariant (derived ids go stale on edit);
     `autoClose` stays at comark's streaming default — optimistically closing a
     truncated tail is the point, and `end()` re-parses canonically to correct it. */
  const parse = createMarkdownParser({ ...ctx.parserOptions, headingIds: false });
  const wasEditable = editor.isEditable;
  editor.setEditable(false, false);

  let active = true;
  /** Newest snapshot handed to `set()`. */
  let latest: string | null = null;
  /** Newest snapshot handed to the parser — the string-dedupe key. */
  let parsed: string | null = null;
  let scheduled = false;
  let frame: number | null = null;
  /** Bumped by every new flush and by `end()` / `abort()`; stale resumes discard. */
  let seq = 0;
  /* Flushes are chained, never concurrent: overlapping parses race the parser's
     incremental cache (completion order ≠ call order), forfeiting node reuse. */
  let inFlight: Promise<void> = Promise.resolve();

  /** One flush per animation frame; SSR / headless falls back to a microtask. */
  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(runFrame);
    else queueMicrotask(runFrame);
  }

  function runFrame(): void {
    scheduled = false;
    frame = null;
    inFlight = inFlight.then(flush);
  }

  /* The microtask fallback can't be cancelled — `flush` bails on `!active`. */
  function cancelFrame(): void {
    if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    scheduled = false;
    frame = null;
  }

  async function flush(): Promise<void> {
    /* comark re-parses the tail even for byte-identical input (pinned upstream),
       so dedupe on the snapshot string before paying for a parse. */
    if (!active || latest === null || latest === parsed) return;
    parsed = latest;
    const token = ++seq;
    try {
      const tree = await parse(parsed, { streaming: true });
      if (token !== seq || !active || editor.isDestroyed) return;
      apply(tree);
    } catch (error) {
      ctx.report(error);
    }
  }

  /** Convert one tree and land it on the editor. Never mutates `tree`. */
  function apply(tree: MarkdownDocument): void {
    replaceTail(editor.schema.nodeFromJSON(ctx.toPmDoc(tree)));
    /* Fresh spreads — the `getAst` memo keys on reference identity. */
    storage.frontmatter = { ...tree.frontmatter };
    storage.meta = { ...tree.meta };
  }

  /**
   * Replace only the changed tail in one transaction, so the unchanged block
   * prefix survives by reference (no re-render, no node-view churn).
   */
  function replaceTail(next: ProseMirrorNode): void {
    const current = editor.state.doc;
    if (current.eq(next)) return;

    const shared = Math.min(current.childCount, next.childCount);
    let prefix = 0;
    let from = 0;
    while (prefix < shared && current.child(prefix).eq(next.child(prefix))) {
      from += current.child(prefix).nodeSize;
      prefix++;
    }
    const tail: ProseMirrorNode[] = [];
    for (let i = prefix; i < next.childCount; i++) tail.push(next.child(i));

    const tr = editor.state.tr.replaceWith(from, current.content.size, tail);
    tr.setMeta(MODEL_APPLY_META, true);
    /* Streamed content enters like collab / external input — the whole stream
       stays out of the undo stack. */
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }

  function restore(): void {
    if (editor.isDestroyed) return;
    editor.setEditable(wasEditable, false);
  }

  async function end(): Promise<void> {
    if (!active) return;
    active = false;
    cancelFrame();
    seq++;
    try {
      /* Canonical re-parse (autoClose off): corrects the optimistic closes the
         streaming parser applied to a truncated tail. A cleanly ended stream
         lands an identical doc, so `replaceTail` no-ops. */
      if (latest !== null && !editor.isDestroyed) {
        const tree = await parseMarkdown(latest, ctx.canonicalOptions);
        if (!editor.isDestroyed) apply(tree);
      }
    } catch (error) {
      ctx.report(error);
    }
    restore();
  }

  function abort(): void {
    if (!active) return;
    active = false;
    cancelFrame();
    seq++;
    restore();
  }

  return {
    set(markdown: string): void {
      if (!active) return;
      latest = markdown;
      schedule();
    },
    end,
    abort,
    get active(): boolean {
      return active && !editor.isDestroyed;
    },
  };
}
