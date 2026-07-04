import { mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ComarkElement, JSONContent, NodeSpec } from "../types";

/** horizontalRule ↔ Comark `hr`. */
export const horizontalRuleSpec: NodeSpec = {
  pmName: "horizontalRule",
  tags: ["hr"],

  toComark(node: JSONContent): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["hr", attrs];
  },

  fromComark(el: ComarkElement): JSONContent {
    const [, rawAttrs] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const out: JSONContent = { type: "horizontalRule" };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};
