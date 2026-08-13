import { mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ElementNode, JSONContent, NodeSpec } from "../types";

/** horizontalRule ↔ Comark `hr`. */
export const horizontalRuleSpec: NodeSpec = {
  pmName: "horizontalRule",
  tags: ["hr"],

  toComark(node: JSONContent): ElementNode {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["hr", attrs];
  },

  fromComark(el: ElementNode): JSONContent {
    const [, rawAttrs] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const out: JSONContent = { type: "horizontalRule" };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};
