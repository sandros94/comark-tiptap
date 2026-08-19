import { mergeAttrs, readHtmlAttrsBag, splitAttrs } from "../utils/attrs";
import type { ElementNode, JSONContent, MarkSpec, Node, NodeSpec, PMMark } from "../types";

/*
 * Factories for the 1:1 specs — a PM type that maps onto exactly one Comark
 * tag with no semantic attrs, no content rules and no dispatch conditions, so
 * the whole round-trip is "carry the htmlAttrs bag across". Anything with its
 * own logic (heading levels, list `start`, link hrefs, cell alignment, …)
 * stays hand-written: do NOT grow these with flags.
 */

/**
 * Spec for a node that is exactly one Comark tag, e.g. `hardBreak` ↔ `br`.
 *
 * @param context - `'inline'` for atoms that live inside a paragraph.
 * @example
 * ```ts
 * const hardBreakSpec = exactNodeSpec('hardBreak', 'br', 'inline')
 * ```
 */
export function exactNodeSpec(
  pmName: string,
  tag: string,
  context: NodeSpec["context"] = "block",
): NodeSpec {
  return {
    pmName,
    tags: [tag],
    context,

    toComark(node: JSONContent): ElementNode {
      return [tag, mergeAttrs({}, readHtmlAttrsBag(node))];
    },

    fromComark(el: ElementNode): JSONContent {
      const { htmlAttrs } = splitAttrs(el[1], []);
      const out: JSONContent = { type: pmName };
      if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
      return out;
    },
  };
}

/**
 * Spec for a mark that is exactly one Comark tag, e.g. `bold` ↔ `strong`.
 *
 * @param tag - The tag emitted on serialization.
 * @param aliases - Extra tags accepted on parse (`b` for `strong`, …).
 * @example
 * ```ts
 * const boldSpec = exactMarkSpec('bold', 'strong', ['b'])
 * ```
 */
export function exactMarkSpec(
  pmName: string,
  tag: string,
  aliases: readonly string[] = [],
): MarkSpec {
  return {
    pmName,
    tags: [tag, ...aliases],

    toComark(mark: PMMark, children: Node[]): ElementNode {
      return [tag, mergeAttrs({}, readHtmlAttrsBag(mark)), ...children];
    },

    fromComark(el: ElementNode): PMMark {
      const { htmlAttrs } = splitAttrs(el[1], []);
      return Object.keys(htmlAttrs).length > 0
        ? { type: pmName, attrs: { htmlAttrs } }
        : { type: pmName };
    },
  };
}
