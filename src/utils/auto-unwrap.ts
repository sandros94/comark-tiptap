import { hasNoHtmlAttrs } from "./attrs";
import type { ComarkHelpers, ElementNode, Node, JSONContent } from "../types";

/*
 * The paragraph-unwrap policy — both rules live here so a change to one is
 * read next to the other. They fire at different levels and therefore stay
 * separate calls rather than one dispatcher: `autoUnwrapBlocks` is a
 * CONTAINER's decision about its block children, `hoistSoleInlineBlockAtom` is
 * a PARAGRAPH's decision about itself, and the doc root takes the second
 * without the first (a lone root paragraph keeps its `p`).
 */

/**
 * Mirror Comark's "single attrless paragraph" autoUnwrap: when `content`
 * holds exactly one paragraph with no `htmlAttrs`, emit its inline children
 * directly instead of a `['p', {}, …]` wrapper; otherwise serialize as blocks.
 *
 * @see {@link hasNoHtmlAttrs} — collapses the missing-vs-`{}` distinction so
 * paragraphs parsed from DOM (where PM fills `{}`) still count as attrless.
 */
export function autoUnwrapBlocks(content: JSONContent[] | undefined, h: ComarkHelpers): Node[] {
  const list = content ?? [];
  if (list.length === 1 && list[0]?.type === "paragraph" && hasNoHtmlAttrs(list[0])) {
    return h.serializeInlines(list[0]?.content);
  }
  return h.serializeBlocks(list);
}

/**
 * Hoist a dual-context atom (`context: 'inline-block'`, i.e. picture) out of
 * the attrless paragraph that is its only parent: comark parses the bare block
 * directive to a top-level element, and rendering it under `p` over-indents
 * the directive body so sources reparse as a code block. Returns `null` when
 * the paragraph must survive.
 *
 * @param children - `node`'s already-serialized inline children.
 */
export function hoistSoleInlineBlockAtom(
  node: JSONContent,
  children: Node[],
  h: ComarkHelpers,
): ElementNode | null {
  if (!hasNoHtmlAttrs(node) || node.content?.length !== 1 || children.length !== 1) return null;
  const sole = children[0];
  const soleSpec = h.getNodeSpec(node.content[0]?.type ?? "");
  /* The serialized element must BE the atom (its tag in the spec's tags) — a
     marked picture serializes to the mark's wrapper (`a`/`strong`/…), which is
     never valid at block position, so it keeps the paragraph. */
  if (
    soleSpec?.context === "inline-block" &&
    Array.isArray(sole) &&
    typeof sole[0] === "string" &&
    soleSpec.tags.includes(sole[0])
  ) {
    return sole as ElementNode;
  }
  return null;
}
