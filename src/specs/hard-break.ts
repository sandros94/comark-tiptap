import { mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ElementNode, JSONContent, NodeSpec } from "../types";

/** hardBreak ↔ Comark `br`. */
export const hardBreakSpec: NodeSpec = {
  pmName: "hardBreak",
  tags: ["br"],
  context: "inline",

  toComark(node: JSONContent): ElementNode {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["br", attrs];
  },

  fromComark(el: ElementNode): JSONContent {
    const [, rawAttrs] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const out: JSONContent = { type: "hardBreak" };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};
