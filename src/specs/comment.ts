import { mergeAttrs, readHtmlAttrsBag, splitAttrs } from "../utils/attrs";
import type { CommentNode, JSONContent, NodeSpec } from "../types";

const SEMANTIC_KEYS = ["text"] as const;

/** comarkComment ↔ Comark comment tuple (`[null, attrs, text]`). */
export const commentSpec: NodeSpec = {
  pmName: "comarkComment",
  /* Dispatched by `el[0] === null` rather than a tag, so the tag set is empty. */
  tags: [] as readonly string[],

  toComark(node: JSONContent): CommentNode {
    const text = (node.attrs?.text as string | undefined) ?? "";
    const attrs = mergeAttrs({}, readHtmlAttrsBag(node));
    return [null, attrs, text];
  },

  /* Narrowed to the comment tuple: the orchestrator routes comments here by
     `pmName`, never by tag, so an ElementNode can't reach this spec. */
  fromComark(el: CommentNode): JSONContent {
    const text = el[2] ?? "";
    const { htmlAttrs } = splitAttrs(el[1], SEMANTIC_KEYS);
    const attrs: Record<string, unknown> = { text };
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    return { type: "comarkComment", attrs };
  },
};
