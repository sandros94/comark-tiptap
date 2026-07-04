import { mergeAttrs, splitAttrs } from "../utils/attrs";
import { autoUnwrapBlocks } from "../utils/auto-unwrap";
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from "../types";

const SEMANTIC_KEYS = ["name"] as const;

/** comarkTemplate ↔ Comark `template`. */
export const templateSpec: NodeSpec = {
  pmName: "comarkTemplate",
  tags: ["template"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const semantic: Record<string, unknown> = {};
    if (node.attrs?.name != null) semantic.name = node.attrs.name;
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    /* Comark autoUnwraps single-paragraph slots; mirror so a one-line template round-trips clean. */
    return ["template", attrs, ...autoUnwrapBlocks(node.content, h)];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, SEMANTIC_KEYS);
    const attrs: Record<string, unknown> = {};
    if (semantic.name != null) attrs.name = semantic.name;
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    const content = h.parseBlocks(children);
    return {
      type: "comarkTemplate",
      attrs,
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    };
  },
};
