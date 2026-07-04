import { Node, mergeAttributes, type Node as TiptapNode } from "@tiptap/core";
import { autoUnwrapBlocks } from "../utils/auto-unwrap";
import { htmlAttrSpec } from "../utils/html-attrs";
import type {
  ComarkElement,
  ComarkElementAttributes,
  ComarkHelpers,
  JSONContent,
  NodeSpec,
} from "../types";

/** Type coercion and serialization rule for a single component prop. */
export interface ComarkComponentProp {
  /**
   * How the value round-trips through Comark attrs:
   *
   *   - `string`  — value rides as-is (`type="info"`).
   *   - `number`  — Comark `:` prefix; coerced to number on parse.
   *   - `boolean` — Comark `:` prefix; `"true"`/`"false"` → boolean.
   *   - `json`    — Comark `:` prefix; JSON-encoded for object/array values.
   */
  type: "string" | "number" | "boolean" | "json";
  /** Applied when the prop is missing on parse. */
  default?: unknown;
}

/** Declarative description of a Comark component, consumed by {@link defineComarkComponent}. */
export interface ComarkComponentDefinition<TNodeView = unknown> {
  /** Comark tag — `alert`, `badge`, `card`, etc. */
  name: string;
  /** Block components (`::alert`) vs inline components (`:badge[…]`). */
  kind: "block" | "inline";
  /**
   * Declared props with type info. Each becomes a flat native PM attr; the
   * round-trip follows Comark's `:`-prefix convention for non-strings.
   */
  props?: Record<string, ComarkComponentProp>;
  /**
   * Optional framework-specific NodeView (Vue SFC, React component, …). The
   * factory only forwards it onto the returned `definition`; it does not wire
   * it into the Tiptap node. Framework bindings (`comark-tiptap/vue`,
   * `comark-tiptap/react`, …) read it and call
   * `extension.extend({ addNodeView: … })` themselves. Narrow the type via
   * `TNodeView`, e.g. `ComarkComponentDefinition<Component>` for Vue.
   */
  nodeView?: TNodeView;
}

/** Return value of {@link defineComarkComponent}. */
export interface ComarkComponentExports<TNodeView = unknown> {
  /** PM extension (Tiptap Node) for the component. */
  extension: TiptapNode;
  /** Serialization spec — pass to `createSerializer`. */
  spec: NodeSpec;
  /** The original definition, so framework wrappers can read it. */
  definition: ComarkComponentDefinition<TNodeView>;
}

// #region prop coercion

/**
 * Coerce an unknown value to a string; non-primitives become `null` (so
 * callers can filter them out and never emit `[object Object]`).
 */
function safeToString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  return null;
}

function decodePropValue(type: ComarkComponentProp["type"], raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  switch (type) {
    case "string":
      return safeToString(raw) ?? undefined;
    case "number": {
      const s = safeToString(raw);
      if (s === null) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    case "json":
      if (typeof raw === "object") return raw;
      if (typeof raw !== "string") return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
  }
}

function encodePropValue(
  type: ComarkComponentProp["type"],
  value: unknown,
): { key: string; raw: string } | null {
  if (value === undefined || value === null) return null;
  switch (type) {
    case "string": {
      const s = safeToString(value);
      return s === null ? null : { key: "", raw: s };
    }
    case "number": {
      const s = safeToString(value);
      return s === null ? null : { key: ":", raw: s };
    }
    case "boolean":
      return { key: ":", raw: String(Boolean(value)) };
    case "json":
      return { key: ":", raw: JSON.stringify(value) };
  }
}

/**
 * Read Comark element attrs, route declared keys into typed props, route
 * the rest into htmlAttrs.
 */
function readPropsAndHtml(
  attrs: ComarkElementAttributes | undefined,
  declared: Record<string, ComarkComponentProp>,
): { props: Record<string, unknown>; htmlAttrs: Record<string, unknown> } {
  const props: Record<string, unknown> = {};
  const htmlAttrs: Record<string, unknown> = {};

  if (!attrs) {
    for (const [name, decl] of Object.entries(declared)) {
      if (decl.default !== undefined) props[name] = decl.default;
    }
    return { props, htmlAttrs };
  }

  const seen = new Set<string>();
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "$") continue;
    if (v === null || v === undefined) continue;
    const bare = k.startsWith(":") ? k.slice(1) : k;
    const decl = declared[bare];
    if (decl) {
      const decoded = decodePropValue(decl.type, v);
      if (decoded !== undefined) {
        props[bare] = decoded;
        seen.add(bare);
      }
    } else {
      htmlAttrs[k] = v;
    }
  }

  for (const [name, decl] of Object.entries(declared)) {
    if (!seen.has(name) && decl.default !== undefined) {
      props[name] = decl.default;
    }
  }

  return { props, htmlAttrs };
}

function writePropsAndHtml(
  props: Record<string, unknown>,
  htmlAttrs: Record<string, unknown>,
  declared: Record<string, ComarkComponentProp>,
): ComarkElementAttributes {
  const out: ComarkElementAttributes = {};

  // Splat htmlAttrs first so semantic prop keys win on collision.
  for (const [k, v] of Object.entries(htmlAttrs)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }

  for (const [name, value] of Object.entries(props)) {
    const decl = declared[name];
    if (!decl) {
      // Stray prop without a declaration — pass through as a string-ish.
      if (value !== null && value !== undefined) out[name] = value;
      continue;
    }
    const enc = encodePropValue(decl.type, value);
    if (!enc) continue;
    out[`${enc.key}${name}`] = enc.raw;
  }

  return out;
}

// #region the factory

/**
 * Build a Comark component from a declarative definition: returns a Tiptap
 * Node extension, a serialization {@link NodeSpec}, and the original
 * definition. Declared props become native PM attrs; undeclared attrs land in
 * the `htmlAttrs` bag.
 *
 * @example
 * ```ts
 * const { extension, spec } = defineComarkComponent({
 *   name: 'alert',
 *   kind: 'block',
 *   props: { type: { type: 'string', default: 'info' } },
 * })
 * ```
 *
 * @see {@link ComarkComponentDefinition}
 * @see {@link ComarkComponentExports}
 */
export function defineComarkComponent<TNodeView = unknown>(
  def: ComarkComponentDefinition<TNodeView>,
): ComarkComponentExports<TNodeView> {
  const declared = def.props ?? {};
  const isInline = def.kind === "inline";

  const spec: NodeSpec = {
    pmName: def.name,
    tags: [def.name],
    context: isInline ? "inline" : "block",

    toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
      const propsBag: Record<string, unknown> = {};
      for (const name of Object.keys(declared)) {
        if (node.attrs && name in node.attrs) propsBag[name] = node.attrs[name];
      }
      const attrs = writePropsAndHtml(
        propsBag,
        (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
        declared,
      );
      /*
       * Block components mirror Comark's autoUnwrap: a single attrless
       * paragraph child flattens to inlines. Inline components hold inline
       * content directly, so the question doesn't arise.
       */
      const children = isInline
        ? h.serializeInlines(node.content)
        : autoUnwrapBlocks(node.content, h);
      return [def.name, attrs, ...children];
    },

    fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
      const [, rawAttrs, ...children] = el;
      const { props, htmlAttrs } = readPropsAndHtml(rawAttrs, declared);
      const attrs: Record<string, unknown> = { ...props };
      if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;

      const content = isInline ? h.parseInlines(children) : h.parseBlocks(children);

      const out: JSONContent = { type: def.name };
      if (Object.keys(attrs).length > 0) out.attrs = attrs;

      if (content.length > 0) {
        out.content = content;
      } else if (!isInline) {
        out.content = [{ type: "paragraph" }];
      }
      return out;
    },
  };

  /*
   * Build the matching Tiptap Node. Each declared prop becomes a first-class
   * PM attr. `htmlAttrs` is declared here rather than delegated to the global
   * `ComarkAttrs` extension because the component name isn't known when the
   * global config is built.
   */
  const propAttrs: Record<string, { default: unknown }> = {};
  for (const [name, decl] of Object.entries(declared)) {
    propAttrs[name] = { default: decl.default ?? null };
  }

  const extension = Node.create({
    name: def.name,
    group: isInline ? "inline" : "block",
    inline: isInline,
    content: isInline ? "inline*" : "block+",
    defining: !isInline,
    selectable: true,
    draggable: !isInline,

    addAttributes() {
      return {
        ...propAttrs,
        ...htmlAttrSpec({ reserved: Object.keys(declared) }),
      };
    },

    parseHTML() {
      return [{ tag: `${isInline ? "span" : "div"}[data-comark-component="${def.name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        isInline ? "span" : "div",
        mergeAttributes(HTMLAttributes, { "data-comark-component": def.name }),
        0,
      ];
    },
  });

  return { extension, spec, definition: def };
}
