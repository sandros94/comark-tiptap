import { cleanAttrs, mergeAttrs } from "../utils/attrs";
import type { ComarkElement, ComarkNode, JSONContent, NodeSpec } from "../types";

/**
 * picture ↔ Comark `picture`. Sources and the inner img are verbatim attr
 * bags on the atom node; child order normalizes to sources-then-img and
 * non-element children are dropped (picture's content model).
 *
 * @remarks
 * AST round-trips are lossless, but *markdown* output of pictures is broken
 * upstream in comark 0.5.0: `$`-less elements render as directives whose
 * inline form doesn't reparse, and raw-HTML children get split by blank
 * lines. Store the AST for documents containing pictures.
 */
export const pictureSpec: NodeSpec = {
  pmName: "picture",
  tags: ["picture"],
  context: "inline",

  toComark(node: JSONContent): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    const sources = (node.attrs?.sources as Record<string, unknown>[] | null | undefined) ?? [];
    const img = node.attrs?.img as Record<string, unknown> | null | undefined;
    const children: ComarkNode[] = sources.map((s) => ["source", cleanAttrs(s)] as ComarkElement);
    if (img) children.push(["img", cleanAttrs(img)] as ComarkElement);
    return ["picture", attrs, ...children];
  },

  fromComark(el: ComarkElement): JSONContent {
    const [, rawAttrs, ...children] = el;
    const htmlAttrs = cleanAttrs(rawAttrs);
    const sources: Record<string, unknown>[] = [];
    let img: Record<string, unknown> | null = null;
    for (const child of children) {
      if (!Array.isArray(child) || typeof child[0] !== "string") continue;
      const [tag, childAttrs] = child;
      if (tag === "source") sources.push(cleanAttrs(childAttrs));
      /* First img wins; picture allows exactly one. */ else if (tag === "img" && img === null)
        img = cleanAttrs(childAttrs);
    }
    const attrs: Record<string, unknown> = { sources, img };
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    return { type: "picture", attrs };
  },
};
