import type { Editor, JSONContent } from '@tiptap/core'
import type {
  ComarkComment,
  ComarkElement,
  ComarkElementAttributes,
  ComarkNode,
  ComarkText,
  ComarkTree,
} from 'comark'

export type {
  ComarkComment,
  ComarkElement,
  ComarkElementAttributes,
  ComarkNode,
  ComarkText,
  ComarkTree,
  JSONContent,
}

/** A ProseMirror mark in JSON form. */
export interface PMMark {
  type: string
  attrs?: Record<string, unknown>
}

/**
 * Content flavor shared by the framework bindings. Drives input dispatch
 * (which command runs) and output read-back (which getter).
 *
 * - `'markdown'` — `comark.parse` (async) in, `getMarkdown()` out.
 * - `'html'` — Tiptap's stock HTML pipeline.
 * - `'json'` — ProseMirror JSON (`JSONContent` or JSON string).
 * - `'ast'` — Comark AST (`ComarkTree` or JSON string), via `setComarkAst` / `getAst`.
 */
export type ContentType = 'markdown' | 'html' | 'json' | 'ast'

/** A value the editor can be seeded/set with. Routed by {@link ContentType}. */
export type ContentValue = ComarkTree | JSONContent | string

/** Context passed to the functional-updater form of a binding's `setContent`. */
export interface SetterContext<T> {
  /** Current content in the requested flavor. */
  content: T
  editor: Editor
}

/** A `setContent` argument: a value, or a function deriving it from the current one. */
export type SetterInput<T> = T | ((ctx: SetterContext<T>) => T | Promise<T>)

/**
 * Serialization spec for one node type: ProseMirror node ↔ Comark element.
 *
 * @see {@link comarkSpecs} for the stock set; {@link defineComarkComponent} emits one per user component.
 */
export interface NodeSpec {
  /** ProseMirror type name (matches the Tiptap node's `name`). */
  pmName: string
  /**
   * Comark tag(s) this node claims, matched on `el[0]`. Empty = dispatched
   * by `pmName` alone (e.g. the comment node, routed when `el[0] === null`).
   */
  tags: readonly string[]
  /**
   * Inline atoms (`hardBreak`, `image`, inline components) live inside a
   * paragraph; blocks stand alone.
   *
   * @default 'block'
   */
  context?: 'block' | 'inline'
  /** ProseMirror JSON node → Comark element. */
  toComark: (node: JSONContent, h: ComarkHelpers) => ComarkNode | null
  /** Comark element → ProseMirror JSON node. */
  fromComark: (el: ComarkElement, h: ComarkHelpers) => JSONContent | null
  /**
   * Disambiguates specs that share a tag: the first whose `matches` returns
   * `true` wins, otherwise registration order decides.
   */
  matches?: (el: ComarkElement) => boolean
}

/** Serialization spec for one mark type: ProseMirror mark ↔ Comark element. */
export interface MarkSpec {
  pmName: string
  tags: readonly string[]
  /** Wrap an already-serialized child node with this mark. */
  toComark: (mark: PMMark, child: ComarkNode) => ComarkElement
  /** Read this mark off a Comark element. */
  fromComark: (el: ComarkElement) => PMMark | null
}

/** Recursion helpers handed to every `toComark` / `fromComark` for nested children. */
export interface ComarkHelpers {
  /** ProseMirror block children → Comark nodes. */
  serializeBlocks: (content: JSONContent[] | undefined) => ComarkNode[]
  /** ProseMirror inline children (text, marks, inline atoms) → Comark nodes. */
  serializeInlines: (content: JSONContent[] | undefined) => ComarkNode[]
  /** Comark block-context children → ProseMirror JSON nodes. */
  parseBlocks: (children: ComarkNode[]) => JSONContent[]
  /** Comark inline-context children → ProseMirror JSON nodes. */
  parseInlines: (children: ComarkNode[]) => JSONContent[]
  /** Node specs the serializer was built with. */
  nodeSpecs: readonly NodeSpec[]
  /** Mark specs the serializer was built with. */
  markSpecs: readonly MarkSpec[]
}
