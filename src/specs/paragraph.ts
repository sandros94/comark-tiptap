import { mergeAttrs, readHtmlAttrsBag, splitAttrs } from "../utils/attrs";
import { hoistSoleInlineBlockAtom } from "../utils/auto-unwrap";
import type { ElementNode, ComarkHelpers, JSONContent, NodeSpec } from "../types";

/** paragraph ↔ Comark `p`. */
export const paragraphSpec: NodeSpec = {
  pmName: "paragraph",
  tags: ["p"],

  toComark(node: JSONContent, h: ComarkHelpers): ElementNode {
    const attrs = mergeAttrs({}, readHtmlAttrsBag(node));
    const children = h.serializeInlines(node.content);
    return hoistSoleInlineBlockAtom(node, children, h) ?? ["p", attrs, ...children];
  },

  fromComark(el: ElementNode, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const out: JSONContent = {
      type: "paragraph",
      content: h.parseInlines(children),
    };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};
