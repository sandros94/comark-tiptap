import { mergeAttrs, readHtmlAttrsBag, splitAttrs } from "../utils/attrs";
import type { ElementNode, Node, JSONContent, NodeSpec } from "../types";

/**
 * picture ↔ Comark `picture`. Sources and the inner img are verbatim attr
 * bags on the atom node; child order normalizes to sources-then-img and
 * non-element children are dropped (picture's content model).
 *
 * @remarks
 * AST round-trips are lossless. Markdown output renders as the `picture`
 * directive (comark 0.6+): the inline form reparses exactly; the block form
 * paragraph-wraps the inner img, which `fromComark` re-absorbs by descending
 * through wrapper elements.
 */
export const pictureSpec: NodeSpec = {
  pmName: "picture",
  tags: ["picture"],
  context: "inline-block",

  toComark(node: JSONContent): ElementNode {
    const attrs = mergeAttrs({}, readHtmlAttrsBag(node));
    const sources = (node.attrs?.sources as Record<string, unknown>[] | null | undefined) ?? [];
    const img = node.attrs?.img as Record<string, unknown> | null | undefined;
    const children: Node[] = sources.map(
      (s) => ["source", splitAttrs(s, []).htmlAttrs] as ElementNode,
    );
    if (img) children.push(["img", splitAttrs(img, []).htmlAttrs] as ElementNode);
    return ["picture", attrs, ...children];
  },

  fromComark(el: ElementNode): JSONContent {
    const [, rawAttrs, ...children] = el;
    const htmlAttrs = splitAttrs(rawAttrs, []).htmlAttrs;
    const sources: Record<string, unknown>[] = [];
    let img: Record<string, unknown> | null = null;
    /* comark's block markdown form wraps the inner `![img]` in a paragraph,
       so its reparse is ['picture',{},['source',…],['p',{},['img',…]]] —
       descend through that one known `p` wrapper ONLY. Anything else (a
       nested picture, a linked img) is left alone rather than absorbed into
       this picture's own sources/img. */
    const walk = (nodes: readonly Node[]): void => {
      for (const child of nodes) {
        if (!Array.isArray(child) || typeof child[0] !== "string") continue;
        const [tag, childAttrs, ...rest] = child as ElementNode;
        if (tag === "source") sources.push(splitAttrs(childAttrs, []).htmlAttrs);
        /* First img wins; picture allows exactly one. */ else if (tag === "img" && img === null) {
          img = splitAttrs(childAttrs, []).htmlAttrs;
        } else if (tag === "p") walk(rest);
      }
    };
    walk(children);
    const attrs: Record<string, unknown> = { sources, img };
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    return { type: "picture", attrs };
  },
};
