import {
  Extension,
  commands as tiptapCommands,
  type Content,
  type Editor,
  type JSONContent,
} from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { parseMarkdown } from "comark";
import { renderMarkdown } from "comark/render";
import { isMarkdownDocumentLike } from "./content";
import { injectComarkStyles } from "./style";
import type {
  CommentNode,
  ElementNode,
  ComarkHelpers,
  Node,
  MarkdownDocument,
  MarkSpec,
  NodeSpec,
  PMMark,
} from "./types";

/* The bundled runtime exposes the core command factories only on the `commands`
   namespace (despite the .d.ts re-exporting them at top level), so destructure
   from there. */
const {
  setContent: baseSetContent,
  insertContent: baseInsertContent,
  insertContentAt: baseInsertContentAt,
} = tiptapCommands;

// #region pure dispatcher

export interface SerializerSpecs {
  nodes: readonly NodeSpec[];
  marks: readonly MarkSpec[];
}

const TEXT_PM_NAME = "text";
const DOC_PM_NAME = "doc";
const CODE_PM_NAME = "code";

/*
 * autoClose — comark's streaming auto-close "closes" dangling markers at the
 * tail of input that doesn't end in a newline (`text with **partial` gains a
 * <strong>). Right for incremental input, wrong for the complete documents
 * the editor always parses — content routinely arrives without a trailing
 * newline. Opt out.
 *
 * headingIds — auto-generated ids are DERIVED data: stored on the PM node
 * they go stale the moment the heading text is edited (and `renderMarkdown`
 * suppresses heading ids anyway). Skip generating them; explicit ids — from
 * markdown `{id="…"}`, a supplied AST, or the DOM — still flow through
 * `htmlAttrs` untouched.
 */
const PARSE_OPTIONS = { autoClose: false, headingIds: false } as const;

const isTextNode = (n: Node): n is string => typeof n === "string";
const isCommentNode = (n: Node): n is CommentNode => Array.isArray(n) && n[0] === null;
const isElementNode = (n: Node): n is ElementNode => Array.isArray(n) && typeof n[0] === "string";

/**
 * Build the recursion helpers from a flat list of node / mark specs.
 * Pure function — call once and reuse the helpers.
 */
export function createSerializer(specs: SerializerSpecs): ComarkHelpers {
  const nodeByPmName = new Map<string, NodeSpec>();
  const nodeByTag = new Map<string, NodeSpec[]>();
  const markByPmName = new Map<string, MarkSpec>();
  const markByTag = new Map<string, MarkSpec[]>();

  for (const spec of specs.nodes) {
    nodeByPmName.set(spec.pmName, spec);
    for (const tag of spec.tags) {
      const list = nodeByTag.get(tag) ?? [];
      list.push(spec);
      nodeByTag.set(tag, list);
    }
  }
  for (const spec of specs.marks) {
    markByPmName.set(spec.pmName, spec);
    for (const tag of spec.tags) {
      const list = markByTag.get(tag) ?? [];
      list.push(spec);
      markByTag.set(tag, list);
    }
  }

  function pickNodeForTag(el: ElementNode): NodeSpec | undefined {
    const candidates = nodeByTag.get(el[0]);
    if (!candidates) return undefined;
    if (candidates.length === 1) return candidates[0];
    return candidates.find((c) => !c.matches || c.matches(el)) ?? candidates[0];
  }

  function pickMarkForTag(el: ElementNode): MarkSpec | undefined {
    const candidates = markByTag.get(el[0]);
    if (!candidates) return undefined;
    return candidates[0];
  }

  /* True for marks (always inline) and for node specs that declared an
     inline context (hardBreak, image, inline-kind components, picture). */
  function isInlineElementNode(el: ElementNode): boolean {
    if (pickMarkForTag(el)) return true;
    const node = pickNodeForTag(el);
    return node?.context === "inline" || node?.context === "inline-block";
  }

  /* A dual-context atom (picture): inline in a text run, block when loose. */
  function isInlineBlockElement(el: ElementNode): boolean {
    if (pickMarkForTag(el)) return false;
    return pickNodeForTag(el)?.context === "inline-block";
  }

  // PM JSON → Comark

  function serializeBlocks(content: JSONContent[] | undefined): Node[] {
    if (!content) return [];
    const out: Node[] = [];
    for (const child of content) {
      if (!child.type) continue;
      const spec = nodeByPmName.get(child.type);
      if (!spec) continue;
      const result = spec.toComark(child, helpers);
      if (result !== null && result !== undefined) out.push(result);
    }
    return out;
  }

  /* One flattened inline unit: its base Comark node (a text string or an inline
     atom element) plus the PM marks wrapping it, ordered outermost-first and
     already filtered to known specs with `code` forced innermost. */
  interface InlineLeaf {
    marks: PMMark[];
    base: Node;
  }

  /* Keep PM's outer-first order for every mark except `code`, which must sit
     innermost: inline code is literal text in markdown, so any mark nested
     inside a `code` element (`['code',{},['em',…]]`) is silently dropped on
     render. A stable sort moves `code` last while preserving sibling order. */
  function normalizeLeafMarks(marks: PMMark[] | undefined): PMMark[] {
    const known = (marks ?? []).filter((m) => m && markByPmName.has(m.type));
    return known
      .map((m, i) => [m, i] as const)
      .sort(([a, ai], [b, bi]) => {
        const ra = a.type === CODE_PM_NAME ? 1 : 0;
        const rb = b.type === CODE_PM_NAME ? 1 : 0;
        return ra - rb || ai - bi;
      })
      .map(([m]) => m);
  }

  /* Same mark identity: type + attrs. Adjacent runs under an identical mark
     coalesce; a difference in htmlAttrs (class/id/…) keeps them separate. */
  function sameMark(a: PMMark, b: PMMark): boolean {
    return a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
  }

  /* Reconstruct Comark nesting from PM's flat per-run marks. At each depth,
     consecutive leaves sharing the same mark are wrapped once and recursed
     into — so a mark spanning mixed content (`**a _b_ c**`) yields a single
     element instead of one wrapper per run (which would lose edge whitespace
     and split a link into several). */
  function groupLeaves(leaves: InlineLeaf[], depth: number): Node[] {
    const out: Node[] = [];
    let i = 0;
    while (i < leaves.length) {
      // `i < leaves.length`, so the element is present.
      const leaf = leaves[i]!;
      const mark = leaf.marks[depth];
      // No mark at this depth → this leaf's own node lands here directly.
      if (!mark) {
        out.push(leaf.base);
        i++;
        continue;
      }
      let j = i + 1;
      while (j < leaves.length) {
        const nextMark = leaves[j]!.marks[depth];
        if (!nextMark || !sameMark(nextMark, mark)) break;
        j++;
      }
      const inner = groupLeaves(leaves.slice(i, j), depth + 1);
      const spec = markByPmName.get(mark.type);
      /* spec is always present — normalizeLeafMarks dropped unknown marks;
         fall back to splatting the children if that ever changes. */
      if (spec) out.push(spec.toComark(mark, inner));
      else out.push(...inner);
      i = j;
    }
    return out;
  }

  function serializeInlines(content: JSONContent[] | undefined): Node[] {
    if (!content) return [];
    const leaves: InlineLeaf[] = [];
    for (const child of content) {
      if (!child.type) continue;
      if (child.type === TEXT_PM_NAME) {
        const text = child.text ?? "";
        if (text.length === 0) continue;
        leaves.push({ marks: normalizeLeafMarks(child.marks as PMMark[] | undefined), base: text });
        continue;
      }
      /* Inline atom (image, hardBreak, inline component): the spec emits its own
         element; its marks wrap it exactly like a text run. */
      const spec = nodeByPmName.get(child.type);
      if (!spec) continue;
      const result = spec.toComark(child, helpers);
      if (result === null || result === undefined) continue;
      leaves.push({ marks: normalizeLeafMarks(child.marks as PMMark[] | undefined), base: result });
    }
    return groupLeaves(leaves, 0);
  }

  // Comark → PM JSON

  function parseBlocks(children: Node[]): JSONContent[] {
    const out: JSONContent[] = [];
    let inlineBuf: Node[] = [];

    const flushInlines = () => {
      if (inlineBuf.length === 0) return;
      const inlines = parseInlines(inlineBuf);
      if (inlines.length > 0) {
        out.push({ type: "paragraph", content: inlines });
      }
      inlineBuf = [];
    };

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (isTextNode(child)) {
        /* Comark's autoUnwrap drops the paragraph wrapper around a lone
           paragraph, so bucket consecutive inlines into one paragraph. */
        if (child.length === 0) continue;
        inlineBuf.push(child);
        continue;
      }
      if (isCommentNode(child)) {
        flushInlines();
        const spec = nodeByPmName.get("comarkComment");
        if (spec) {
          const result = spec.fromComark(child as unknown as ElementNode, helpers);
          if (result) out.push(result);
        }
        continue;
      }
      if (!isElementNode(child)) continue;

      // Inline element (mark or inline-context node)? Buffer it.
      if (isInlineElementNode(child)) {
        /* A loose dual-context atom (a standalone `picture`, from the block
           directive parse or the sole-child hoist) gets its OWN paragraph
           unless it belongs to a text run — the buffer is already open, or
           the next sibling is a run inline (text / non-atom inline element).
           Without this, adjacent standalone pictures would merge into one
           paragraph and getAst() → setComarkAst() would not be idempotent. */
        if (inlineBuf.length === 0 && isInlineBlockElement(child)) {
          const next = children[i + 1];
          const nextIsRunInline =
            next !== undefined &&
            ((isTextNode(next) && next.length > 0) ||
              (isElementNode(next) && isInlineElementNode(next) && !isInlineBlockElement(next)));
          if (!nextIsRunInline) {
            const inlines = parseInlines([child]);
            if (inlines.length > 0) out.push({ type: "paragraph", content: inlines });
            continue;
          }
        }
        inlineBuf.push(child);
        continue;
      }

      // Block element — flush whatever inlines we accumulated, then emit.
      flushInlines();
      const spec = pickNodeForTag(child);
      if (!spec) {
        /* Unknown / forward-compat block tag: splat its children so their
           content survives, instead of dropping the whole subtree. Mirrors the
           inline fallback in parseInlines. */
        out.push(...parseBlocks(child.slice(2) as Node[]));
        continue;
      }
      const result = spec.fromComark(child, helpers);
      if (result) out.push(result);
    }

    flushInlines();
    return out;
  }

  function parseInlines(children: Node[]): JSONContent[] {
    const out: JSONContent[] = [];
    for (const child of children) {
      if (isTextNode(child)) {
        if (child.length === 0) continue;
        out.push({ type: "text", text: child });
        continue;
      }
      if (isCommentNode(child)) {
        // Comments inside inline runs are unusual; drop them silently.
        continue;
      }
      if (!isElementNode(child)) continue;

      // Mark? Recurse into its children with the mark layered on.
      const markSpec = pickMarkForTag(child);
      if (markSpec) {
        const mark = markSpec.fromComark(child);
        if (!mark) continue;
        const innerChildren = child.slice(2) as Node[];
        const innerJson = parseInlines(innerChildren);
        for (const j of innerJson) {
          /* Prepend: this mark is the outermost seen so far (recursion unwinds
             inside-out), keeping PM's outer-first order. */
          const existing = (j.marks ?? []) as PMMark[];
          out.push({ ...j, marks: [mark, ...existing] });
        }
        continue;
      }

      // Inline node (img, hardBreak, custom inline component)?
      const nodeSpec = pickNodeForTag(child);
      if (!nodeSpec) {
        /* Unknown tag: splat children as a lossy fallback so text still shows.
           Only fires for hand-authored AST with unrecognized tags. */
        const innerChildren = child.slice(2) as Node[];
        out.push(...parseInlines(innerChildren));
        continue;
      }
      const json = nodeSpec.fromComark(child, helpers);
      if (json) out.push(json);
    }
    return out;
  }

  const helpers: ComarkHelpers = {
    getNodeSpec: (pmName) => nodeByPmName.get(pmName),
    serializeBlocks,
    serializeInlines,
    parseBlocks,
    parseInlines,
    nodeSpecs: specs.nodes,
    markSpecs: specs.marks,
  };
  return helpers;
}

// #region doc-level convenience

/**
 * Convert a PM doc JSON to a Comark tree using the given helpers.
 *
 * @param carry - Caller-supplied `frontmatter` / `meta` to copy onto the tree.
 * @throws If `doc.type` is not the PM `doc` node.
 */
export function pmDocToComark(
  doc: JSONContent,
  helpers: ComarkHelpers,
  carry: { frontmatter?: Record<string, unknown>; meta?: Record<string, unknown> } = {},
): MarkdownDocument {
  if (doc.type !== DOC_PM_NAME) {
    throw new Error(`Expected PM doc node, got "${doc.type}"`);
  }
  return {
    nodes: helpers.serializeBlocks(doc.content),
    frontmatter: { ...carry.frontmatter },
    meta: { ...carry.meta },
  };
}

/** Convert a Comark tree to a PM doc JSON using the given helpers. */
export function comarkToPmDoc(tree: MarkdownDocument, helpers: ComarkHelpers): JSONContent {
  const content = helpers.parseBlocks(tree.nodes);
  return {
    type: DOC_PM_NAME,
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

// #region Tiptap extension — wires the orchestrator to a live editor

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comark: {
      /**
       * Replace editor content from a Comark AST.
       *
       * Accepts a `MarkdownDocument` or a JSON-encoded AST string (for symmetry with
       * `setComarkMarkdown`). A string is `JSON.parse`d and shape-checked; an
       * invalid shape returns `false` without touching the editor.
       *
       * @param value - A `MarkdownDocument` or its JSON-encoded string form.
       * @param options - Pass `{ emitUpdate: false }` to apply silently (no `update` event).
       * @example
       * ```ts
       * editor.commands.setComarkAst({ nodes: [] })
       * editor.commands.setComarkAst(jsonString, { emitUpdate: false })
       * ```
       */
      setComarkAst: (
        value: MarkdownDocument | string,
        options?: SetComarkContentOptions,
      ) => ReturnType;
      /**
       * Replace editor content from a markdown string (parsed via comark).
       *
       * @param markdown - Markdown source.
       * @param options - Same semantics as {@link setComarkAst}.
       */
      setComarkMarkdown: (markdown: string, options?: SetComarkContentOptions) => ReturnType;
    };
  }
  interface Storage {
    comark: ComarkSerializerStorage;
  }
  interface InsertContentOptions {
    /** Flatten a markdown string's blocks so it inserts as an inline run at the cursor, not a new paragraph. */
    inline?: boolean;
    /**
     * How to interpret a `string` input; ignored for objects (auto-detected:
     * `{ nodes: [...] }` → Comark AST, everything else → PM JSON / Fragment / node).
     *
     * @default 'markdown'
     * @remarks
     * - `'markdown'` — `parseMarkdown`, async.
     * - `'html'` — Tiptap's stock HTML pipeline, sync.
     * - `'json'` — `JSON.parse`, then route by shape.
     */
    contentType?: "markdown" | "html" | "json";
    /** Meta entries stamped on the inserting transaction, readable via `transaction.getMeta(key)`. */
    transactionMeta?: Record<string, unknown>;
  }
  /** Same options as {@link InsertContentOptions}, for `insertContentAt`. */
  interface InsertContentAtOptions {
    inline?: boolean;
    contentType?: "markdown" | "html" | "json";
    transactionMeta?: Record<string, unknown>;
  }
  interface SetContentOptions {
    /**
     * How to interpret a `string` input; ignored for objects (auto-detected).
     *
     * @default 'markdown'
     */
    contentType?: "markdown" | "html" | "json";
    /** Meta entries stamped on the applying transaction, readable via `transaction.getMeta(key)`. */
    transactionMeta?: Record<string, unknown>;
  }
  interface EditorOptions {
    /**
     * How to interpret a string `content` passed to the `Editor` constructor;
     * `'html'` or `'json'` bypass Comark's markdown parser. Object `content` is
     * auto-detected (Comark AST vs PM JSON) and ignores this.
     *
     * @default 'markdown'
     */
    contentType?: "markdown" | "html" | "json";
  }
}

/**
 * Options for {@link setComarkAst} and {@link setComarkMarkdown} — a strict
 * subset of Tiptap's `SetContentOptions`. `parseOptions` is absent: Comark
 * inputs never reach Tiptap's HTML parser.
 */
export interface SetComarkContentOptions {
  /**
   * Fire the editor's `update` event after replacing content.
   *
   * @default true
   */
  emitUpdate?: boolean;

  /**
   * Throw on invalid content (relative to the active schema) instead of
   * silently coercing it. Mirrors Tiptap's option of the same name; when
   * omitted, the editor's `enableContentCheck` setting decides.
   */
  errorOnInvalidContent?: boolean;

  /**
   * Meta entries stamped on the transaction that applies the content
   * (readable in `onUpdate` via `transaction.getMeta(key)`). On the async
   * markdown path the entries ride to the eventual apply transaction.
   */
  transactionMeta?: Record<string, unknown>;
}

/** Which operation raised an error handed to a {@link ComarkErrorHandler}. */
export interface ComarkErrorContext {
  phase:
    | "construct"
    | "setContent"
    | "setComarkAst"
    | "setComarkMarkdown"
    | "insertContent"
    | "insertContentAt"
    | "render";
}

/**
 * Observe the async parse / render / AST-JSON failures the kit otherwise
 * swallows to `console.warn`. When set it REPLACES the default warn, so a
 * consumer can log, surface, or silence them.
 *
 * @example
 * ```ts
 * ComarkKit.configure({ serializer: { onError: (e, { phase }) => report(phase, e) } })
 * ```
 */
export type ComarkErrorHandler = (error: unknown, context: ComarkErrorContext) => void;

export interface ComarkSerializerStorage {
  /** The dispatch helpers built from the registered specs. */
  helpers: ComarkHelpers;
  /**
   * Consumer error handler forwarded from options (`undefined` = default
   * `console.warn`). Bindings read it to report their own render failures.
   */
  onError?: ComarkErrorHandler;
  /** External frontmatter / meta the editor doesn't own. */
  frontmatter: Record<string, unknown>;
  meta: Record<string, unknown>;
  /**
   * Editor instance, populated on `onBeforeCreate`. Internal — use
   * `getAst` / `getMarkdown` instead of reaching in directly.
   */
  editor: Editor | null;
  /** Single-slot `getAst` memo, keyed on PM doc identity plus frontmatter/meta reference identity. @internal */
  astCache: {
    doc: ProseMirrorNode;
    frontmatter: Record<string, unknown>;
    meta: Record<string, unknown>;
    ast: MarkdownDocument;
  } | null;
  /** Single-slot `getMarkdown` memo, keyed on the `getAst` result's identity. @internal */
  markdownCache: { ast: MarkdownDocument; markdown: string } | null;
  /**
   * Read the editor's current content as a Comark AST. The returned document
   * is a shared snapshot — treat it as read-only.
   */
  getAst(): MarkdownDocument;
  /** Read the editor's current content as Comark markdown. */
  getMarkdown(): Promise<string>;
}

export interface ComarkSerializerOptions {
  /**
   * Serialization specs the orchestrator dispatches on. `ComarkKit` supplies
   * the stock specs plus any user components; direct consumers can pass a subset.
   */
  specs: SerializerSpecs;

  /**
   * Auto-inject the kit's operational stylesheet (`comarkStyle`) into
   * `document.head` on editor creation. Dedups to a single
   * `<style data-comark-style>` tag shared across every editor.
   *
   * Set to `false` when a host ships its own stylesheet, or to inject
   * `comarkStyle` yourself (CSP nonce / Shadow DOM / scoped pipeline).
   *
   * @default true
   */
  injectStyles: boolean;

  /**
   * CSP nonce applied to the auto-injected style tag. Mirrors Tiptap
   * core's `injectNonce`. Ignored when `injectStyles` is `false`.
   *
   * @default undefined
   */
  injectNonce?: string;

  /**
   * Observe async parse / render / AST-JSON failures instead of the default
   * `console.warn`. See {@link ComarkErrorHandler}.
   *
   * @default undefined
   */
  onError?: ComarkErrorHandler;
}

const EMPTY_HELPERS: ComarkHelpers = createSerializer({ nodes: [], marks: [] });

/** Route a swallowed failure to the consumer handler, or `console.warn` by default. */
function reportError(
  onError: ComarkErrorHandler | undefined,
  error: unknown,
  context: ComarkErrorContext,
): void {
  if (onError) {
    onError(error, context);
  } else if (typeof console !== "undefined") {
    console.warn(`[comark] ${context.phase} failed:`, error);
  }
}

/** Stamp caller-supplied `transactionMeta` entries on a command's transaction. */
function stampTransactionMeta(tr: Transaction, meta: Record<string, unknown> | undefined): void {
  if (!meta) return;
  for (const [key, value] of Object.entries(meta)) {
    tr.setMeta(key, value);
  }
}

export const ComarkSerializer = Extension.create<ComarkSerializerOptions, ComarkSerializerStorage>({
  name: "comark",

  addOptions() {
    return {
      specs: { nodes: [], marks: [] },
      injectStyles: true,
      injectNonce: undefined,
      onError: undefined,
    };
  },

  addStorage(): ComarkSerializerStorage {
    return {
      helpers: EMPTY_HELPERS,
      frontmatter: {},
      meta: {},
      editor: null,
      onError: undefined,
      astCache: null,
      markdownCache: null,
      getAst(this: ComarkSerializerStorage): MarkdownDocument {
        if (!this.editor) throw new Error("[comark] editor not yet attached");
        /* The PM doc is immutable and `setComarkAst` / `setContent` replace
           frontmatter/meta with fresh spreads, so reference identity on the
           three inputs fully determines the result. */
        const doc = this.editor.state.doc;
        const cache = this.astCache;
        if (
          cache &&
          cache.doc === doc &&
          cache.frontmatter === this.frontmatter &&
          cache.meta === this.meta
        ) {
          return cache.ast;
        }
        const ast = pmDocToComark(this.editor.getJSON() as JSONContent, this.helpers, {
          frontmatter: this.frontmatter,
          meta: this.meta,
        });
        this.astCache = { doc, frontmatter: this.frontmatter, meta: this.meta, ast };
        return ast;
      },
      async getMarkdown(this: ComarkSerializerStorage): Promise<string> {
        /* Layered on the getAst memo: the entry is keyed on that exact tree
           object, so a doc change landing mid-render writes an entry for the
           tree it rendered (still correct, just no longer current) and a
           concurrent duplicate render writes an identical one. */
        const tree = this.getAst();
        if (this.markdownCache?.ast === tree) return this.markdownCache.markdown;
        const markdown = await renderMarkdown(tree);
        this.markdownCache = { ast: tree, markdown };
        return markdown;
      },
    };
  },

  onBeforeCreate() {
    /* Stash the editor here, not in onCreate: a host's onCreate may call
       setComarkAst, which dispatches before our own onCreate would run. */
    this.storage.editor = this.editor;
    this.storage.helpers = createSerializer(this.options.specs);
    this.storage.onError = this.options.onError;

    /* Tiptap's constructor calls createDocument(options.content) directly, so the
       setContent override below never fires for the seed — hijack options.content
       here, before createDoc runs, for cases the stock pipeline can't handle:
         - string (markdown): parseMarkdown is async, so mount empty and re-apply
           when it resolves (update fires then).
         - string + contentType 'json': strict PM JSON, pass through to Tiptap.
         - string + contentType 'html': Tiptap's stock HTML path.
         - Comark-tree object: apply via setComarkAst (Tiptap can't build from one).
         - else (PM JSON, Fragment, ProseMirrorNode): leave content for Tiptap. */
    const opts = this.editor.options;
    if (typeof opts.content === "string" && opts.content !== "") {
      if (opts.contentType === "html") {
        // Pass-through to Tiptap's stock HTML pipeline.
      } else if (opts.contentType === "json") {
        /* Parse PM JSON ourselves: the lib doesn't ship @tiptap/markdown's
           MarkdownManager, which is what lets stock Tiptap accept JSON strings. */
        const parsed = safeJsonParse(opts.content, this.options.onError, "construct");
        opts.content = parsed === undefined ? "" : (parsed as typeof opts.content);
      } else {
        const markdown = opts.content;
        opts.content = "";
        parseMarkdown(markdown, PARSE_OPTIONS)
          .then((tree) => {
            if (this.editor.isDestroyed) return;
            this.editor.commands.setComarkAst(tree, { emitUpdate: true });
          })
          .catch((err) => {
            reportError(this.options.onError, err, { phase: "construct" });
          });
      }
    } else if (isMarkdownDocumentLike(opts.content)) {
      const tree = opts.content;
      opts.content = null;
      queueMicrotask(() => {
        if (this.editor.isDestroyed) return;
        this.editor.commands.setComarkAst(tree, { emitUpdate: false });
      });
    }

    /* Inject at construction, like Tiptap core. injectComarkStyles is a no-op
       when document is undefined, so this is safe in SSR / Node test runners. */
    if (this.options.injectStyles) {
      injectComarkStyles(this.options.injectNonce);
    }
  },

  addCommands() {
    return {
      setComarkAst:
        (value: MarkdownDocument | string, options?: SetComarkContentOptions) =>
        ({ commands }) => {
          /* String form: JSON.parse + AST shape-check; bad shapes return false. */
          let tree: MarkdownDocument;
          if (typeof value === "string") {
            const parsed = safeJsonParse(value, this.options.onError, "setComarkAst");
            if (parsed === undefined || !isMarkdownDocumentLike(parsed)) {
              /* Bad JSON is already reported by safeJsonParse; only the
                 valid-JSON-but-wrong-shape case needs a report here. */
              if (parsed !== undefined) {
                reportError(
                  this.options.onError,
                  new Error("setComarkAst: input is not a Comark AST (missing `nodes` array)"),
                  { phase: "setComarkAst" },
                );
              }
              return false;
            }
            tree = parsed;
          } else {
            tree = value;
          }
          this.storage.frontmatter = { ...tree.frontmatter };
          this.storage.meta = { ...tree.meta };
          const doc = pruneDoc(
            comarkToPmDoc(tree, this.storage.helpers),
            this.editor.schema,
            this.options.onError,
            "setComarkAst",
          );
          return commands.setContent(doc, {
            emitUpdate: options?.emitUpdate ?? true,
            errorOnInvalidContent: options?.errorOnInvalidContent,
            transactionMeta: options?.transactionMeta,
          });
        },
      setComarkMarkdown:
        (markdown: string, options?: SetComarkContentOptions) =>
        ({ editor }) => {
          parseMarkdown(markdown, PARSE_OPTIONS)
            .then((tree) => {
              if (editor.isDestroyed) return;
              editor.commands.setComarkAst(tree, options);
            })
            .catch((err) => {
              reportError(this.options.onError, err, { phase: "setComarkMarkdown" });
            });
          return true;
        },

      /* Overrides for Tiptap's core content commands: strings default to markdown;
         objects auto-detect (nodes array → Comark AST via setComarkAst, else stock).
         Empty string falls through to keep clearContent's setContent('') synchronous.
         Markdown path: parseMarkdown is async, so a string seed applies a microtask
         later and the command returns true optimistically (update fires on resolve).
         contentType (strings only): 'html' → Tiptap HTML, sync; 'json' → strict PM
         JSON, sync (AST strings belong on setComarkAst). */
      setContent: (content, options) => (props) => {
        /* Command chains share one transaction, so stamping here covers every
           synchronous branch below (baseSetContent mutates this same `tr`). */
        stampTransactionMeta(props.tr, options?.transactionMeta);
        /* Inline the AST application here (don't call editor.commands.setComarkAst):
           invoking another command from inside a (props) => handler dispatches a
           fresh transaction, which ProseMirror rejects as mismatched. */
        if (isMarkdownDocumentLike(content)) {
          this.storage.frontmatter = { ...content.frontmatter };
          this.storage.meta = { ...content.meta };
          const doc = pruneDoc(
            comarkToPmDoc(content, this.storage.helpers),
            props.editor.schema,
            this.options.onError,
            "setContent",
          );
          return baseSetContent(doc as unknown as Content, options)(props);
        }
        if (typeof content !== "string" || content === "" || options?.contentType === "html") {
          return baseSetContent(content as Content, options)(props);
        }
        if (options?.contentType === "json") {
          /* Strict PM JSON; AST strings belong on setComarkAst, no shape-sniff here. */
          const parsed = safeJsonParse(content, this.options.onError, "setContent");
          if (parsed === undefined) return false;
          return baseSetContent(parsed as Content, options)(props);
        }
        parseMarkdown(content, PARSE_OPTIONS)
          .then((tree) => {
            if (props.editor.isDestroyed) return;
            /* Outer transaction has settled here, so a fresh command is safe. */
            props.editor.commands.setComarkAst(tree, {
              emitUpdate: options?.emitUpdate ?? true,
              errorOnInvalidContent: options?.errorOnInvalidContent,
              transactionMeta: options?.transactionMeta,
            });
          })
          .catch((err) => {
            reportError(this.options.onError, err, { phase: "setContent" });
          });
        return true;
      },

      insertContent: (value, options) => (props) => {
        /* Same stamping as setContent: one `tr` per chain covers the sync
           branches, and the async markdown branch forwards `options` to the
           re-entrant call, which stamps the deferred transaction. */
        stampTransactionMeta(props.tr, options?.transactionMeta);
        if (isMarkdownDocumentLike(value)) {
          const payload = comarkTreeToInsertPayload(
            value,
            this.storage.helpers,
            options?.inline,
            props.editor.schema,
            this.options.onError,
            "insertContent",
          );
          return baseInsertContent(payload, options)(props);
        }
        if (typeof value !== "string" || value === "" || options?.contentType === "html") {
          return baseInsertContent(value as Content, options)(props);
        }
        if (options?.contentType === "json") {
          const parsed = safeJsonParse(value, this.options.onError, "insertContent");
          if (parsed === undefined) return false;
          return baseInsertContent(parsed as Content, options)(props);
        }
        parseMarkdown(value, PARSE_OPTIONS)
          .then((tree) => {
            if (props.editor.isDestroyed) return;
            const payload = comarkTreeToInsertPayload(
              tree,
              this.storage.helpers,
              options?.inline,
              props.editor.schema,
              this.options.onError,
              "insertContent",
            );
            props.editor.commands.insertContent(payload, options);
          })
          .catch((err) => {
            reportError(this.options.onError, err, { phase: "insertContent" });
          });
        return true;
      },

      insertContentAt: (position, value, options) => (props) => {
        stampTransactionMeta(props.tr, options?.transactionMeta);
        if (isMarkdownDocumentLike(value)) {
          const payload = comarkTreeToInsertPayload(
            value,
            this.storage.helpers,
            options?.inline,
            props.editor.schema,
            this.options.onError,
            "insertContentAt",
          );
          return baseInsertContentAt(position, payload, options)(props);
        }
        if (typeof value !== "string" || value === "" || options?.contentType === "html") {
          return baseInsertContentAt(position, value as Content, options)(props);
        }
        if (options?.contentType === "json") {
          const parsed = safeJsonParse(value, this.options.onError, "insertContentAt");
          if (parsed === undefined) return false;
          return baseInsertContentAt(position, parsed as Content, options)(props);
        }
        parseMarkdown(value, PARSE_OPTIONS)
          .then((tree) => {
            if (props.editor.isDestroyed) return;
            const payload = comarkTreeToInsertPayload(
              tree,
              this.storage.helpers,
              options?.inline,
              props.editor.schema,
              this.options.onError,
              "insertContentAt",
            );
            props.editor.commands.insertContentAt(position, payload, options);
          })
          .catch((err) => {
            reportError(this.options.onError, err, { phase: "insertContentAt" });
          });
        return true;
      },
    };
  },
});

// #region routing helpers (Comark AST detection + dispatch)

function safeJsonParse(
  input: string,
  onError: ComarkErrorHandler | undefined,
  phase: ComarkErrorContext["phase"],
): unknown {
  try {
    return JSON.parse(input);
  } catch (err) {
    reportError(onError, err, { phase });
    return undefined;
  }
}

/**
 * Drop nodes/marks whose type is missing from the schema — extensions the
 * consumer disabled (`picture: false`, `comment: false`) while their specs
 * stay registered. Without this, one unknown type makes Tiptap's content
 * check reset the WHOLE document. Each drop is reported through `onError`.
 */
function pruneUnknownTypes(
  json: JSONContent,
  schema: Schema,
  onError: ComarkErrorHandler | undefined,
  phase: ComarkErrorContext["phase"],
): JSONContent | null {
  if (json.type && json.type !== TEXT_PM_NAME && !schema.nodes[json.type]) {
    reportError(onError, new Error(`dropped AST node for disabled type "${json.type}"`), {
      phase,
    });
    return null;
  }
  const out: JSONContent = { ...json };
  if (out.marks) {
    out.marks = out.marks.filter((m) => {
      if (schema.marks[m.type]) return true;
      reportError(onError, new Error(`dropped mark for disabled type "${m.type}"`), { phase });
      return false;
    });
  }
  if (out.content) {
    out.content = out.content
      .map((c) => pruneUnknownTypes(c, schema, onError, phase))
      .filter((c): c is JSONContent => c !== null);
  }
  return out;
}

/** {@link pruneUnknownTypes} for a whole doc: the root itself never drops. */
function pruneDoc(
  doc: JSONContent,
  schema: Schema,
  onError: ComarkErrorHandler | undefined,
  phase: ComarkErrorContext["phase"],
): JSONContent {
  return pruneUnknownTypes(doc, schema, onError, phase) ?? { type: DOC_PM_NAME };
}

/* MarkdownDocument → the payload insertContent / insertContentAt want: the doc's block
   content array, or its inline-flattened form when inline is true. PM's insert*
   commands take a slice of nodes, not a doc node. */
function comarkTreeToInsertPayload(
  tree: MarkdownDocument,
  helpers: ComarkHelpers,
  inline: boolean | undefined,
  schema: Schema,
  onError: ComarkErrorHandler | undefined,
  phase: ComarkErrorContext["phase"],
): Content {
  const doc = pruneDoc(comarkToPmDoc(tree, helpers), schema, onError, phase);
  return inline ? (extractInlines(doc) as Content) : ((doc.content ?? []) as Content);
}

/* Flatten a parsed PM doc to its inline children for an inline insert. Blocks are
   joined with a hardBreak between them so source paragraph boundaries aren't lost
   — 'a\n\nb' becomes a + hardBreak + b, not ab; a single paragraph just unwraps. */
function extractInlines(doc: JSONContent): JSONContent[] {
  const blocks = doc.content ?? [];
  const out: JSONContent[] = [];
  for (const block of blocks) {
    const inner = block?.content ?? [];
    if (inner.length === 0) continue;
    if (out.length > 0) out.push({ type: "hardBreak" });
    out.push(...inner);
  }
  return out;
}
