import { mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ElementNode, ComarkHelpers, JSONContent, NodeSpec } from "../types";

/** paragraph ↔ Comark `p`. */
export const paragraphSpec: NodeSpec = {
  pmName: "paragraph",
  tags: ["p"],

  toComark(node: JSONContent, h: ComarkHelpers): ElementNode {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    const children = h.serializeInlines(node.content);
    /* A dual-context atom (`context: 'inline-block'`, i.e. picture) that is an
       attrless paragraph's only child hoists out of the wrapper: comark parses
       the bare block directive to a top-level element, and rendering it under
       `p` over-indents the directive body so sources reparse as a code block. */
    if (Object.keys(attrs).length === 0 && node.content?.length === 1 && children.length === 1) {
      const soleType = node.content[0]?.type;
      const soleSpec = soleType ? h.nodeSpecs.find((s) => s.pmName === soleType) : undefined;
      if (soleSpec?.context === "inline-block" && Array.isArray(children[0])) {
        return children[0] as ElementNode;
      }
    }
    return ["p", attrs, ...children];
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
