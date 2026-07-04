import { hasNoHtmlAttrs } from "./attrs";
import type { ComarkHelpers, ComarkNode, JSONContent } from "../types";

/**
 * Mirror Comark's "single attrless paragraph" autoUnwrap: when `content`
 * holds exactly one paragraph with no `htmlAttrs`, emit its inline children
 * directly instead of a `['p', {}, …]` wrapper; otherwise serialize as blocks.
 *
 * @see {@link hasNoHtmlAttrs} — collapses the missing-vs-`{}` distinction so
 * paragraphs parsed from DOM (where PM fills `{}`) still count as attrless.
 */
export function autoUnwrapBlocks(
  content: JSONContent[] | undefined,
  h: ComarkHelpers,
): ComarkNode[] {
  const list = content ?? [];
  if (list.length === 1 && list[0]?.type === "paragraph" && hasNoHtmlAttrs(list[0])) {
    return h.serializeInlines(list[0]?.content);
  }
  return h.serializeBlocks(list);
}
