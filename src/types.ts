import type { Editor, JSONContent } from "@tiptap/core";
import type {
  CommentNode,
  ElementNode,
  ElementNodeAttributes,
  Node,
  TextNode,
  MarkdownDocument,
} from "comark";

export type {
  CommentNode,
  ElementNode,
  ElementNodeAttributes,
  Node,
  TextNode,
  MarkdownDocument,
  JSONContent,
};

/** Context handed to a {@link ResolveSrc} resolver alongside each URL. */
export interface ResolveSrcContext {
  /** Display attribute the URL came from. */
  attr: "src" | "srcset";
  /** Node rendering it. */
  node: "image" | "picture";
}

/**
 * Display-only URL resolver: maps a stored source (e.g. a storage-relative
 * key) to the URL the editor DOM shows; `undefined` keeps the stored value.
 * Never runs on parse or serialization — node attrs, AST, and markdown keep
 * the raw value. `srcset` resolves per candidate URL. Plain `(src) => …`
 * mappers (e.g. wrapping `@nuxt/image`'s `useImage()`) are assignable.
 */
export type ResolveSrc = (src: string, context: ResolveSrcContext) => string | undefined;

/** A ProseMirror mark in JSON form. */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Content flavor shared by the framework bindings. Drives input dispatch
 * (which command runs) and output read-back (which getter).
 *
 * - `'markdown'` — `parseMarkdown` (async) in, `getMarkdown()` out.
 * - `'html'` — Tiptap's stock HTML pipeline.
 * - `'json'` — ProseMirror JSON (`JSONContent` or JSON string).
 * - `'ast'` — Comark AST (`MarkdownDocument` or JSON string), via `setComarkAst` / `getAst`.
 */
export type ContentType = "markdown" | "html" | "json" | "ast";

/** A value the editor can be seeded/set with. Routed by {@link ContentType}. */
export type ContentValue = MarkdownDocument | JSONContent | string;

/** Context passed to the functional-updater form of a binding's `setContent`. */
export interface SetterContext<T> {
  /** Current content in the requested flavor. */
  content: T;
  editor: Editor;
}

/** A `setContent` argument: a value, or a function deriving it from the current one. */
export type SetterInput<T> = T | ((ctx: SetterContext<T>) => T | Promise<T>);

/**
 * Serialization spec for one node type: ProseMirror node ↔ Comark element.
 *
 * @see {@link comarkSpecs} for the stock set; {@link defineComarkComponent} emits one per user component.
 */
export interface NodeSpec {
  /** ProseMirror type name (matches the Tiptap node's `name`). */
  pmName: string;
  /**
   * Comark tag(s) this node claims, matched on `el[0]`. Empty = dispatched
   * by `pmName` alone (e.g. the comment node, routed when `el[0] === null`).
   */
  tags: readonly string[];
  /**
   * Inline atoms (`hardBreak`, `image`, inline components) live inside a
   * paragraph; blocks stand alone. `'inline-block'` marks a dual-context atom
   * (picture): inline in PM and in text runs, but hoisted back to a top-level
   * element when it is an attrless paragraph's only child — the shape comark
   * parses the bare block directive into.
   *
   * @default 'block'
   */
  context?: "block" | "inline" | "inline-block";
  /** ProseMirror JSON node → Comark element. */
  toComark: (node: JSONContent, h: ComarkHelpers) => Node | null;
  /** Comark element → ProseMirror JSON node. */
  fromComark: (el: ElementNode, h: ComarkHelpers) => JSONContent | null;
  /**
   * Disambiguates specs that share a tag: the first whose `matches` returns
   * `true` wins, otherwise registration order decides.
   */
  matches?: (el: ElementNode) => boolean;
}

/** Serialization spec for one mark type: ProseMirror mark ↔ Comark element. */
export interface MarkSpec {
  pmName: string;
  tags: readonly string[];
  /**
   * Wrap already-serialized child nodes with this mark. Receives every
   * consecutive sibling that shares this mark as its outermost layer, so a
   * mark spanning mixed content (`**a _b_ c**`) becomes one element, not one
   * per run.
   */
  toComark: (mark: PMMark, children: Node[]) => ElementNode;
  /** Read this mark off a Comark element. */
  fromComark: (el: ElementNode) => PMMark | null;
}

/** Recursion helpers handed to every `toComark` / `fromComark` for nested children. */
export interface ComarkHelpers {
  /** ProseMirror block children → Comark nodes. */
  serializeBlocks: (content: JSONContent[] | undefined) => Node[];
  /** ProseMirror inline children (text, marks, inline atoms) → Comark nodes. */
  serializeInlines: (content: JSONContent[] | undefined) => Node[];
  /** Comark block-context children → ProseMirror JSON nodes. */
  parseBlocks: (children: Node[]) => JSONContent[];
  /** Comark inline-context children → ProseMirror JSON nodes. */
  parseInlines: (children: Node[]) => JSONContent[];
  /** Node specs the serializer was built with. */
  nodeSpecs: readonly NodeSpec[];
  /** Mark specs the serializer was built with. */
  markSpecs: readonly MarkSpec[];
}
