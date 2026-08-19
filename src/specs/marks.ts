import { mergeAttrs, readHtmlAttrsBag, splitAttrs } from "../utils/attrs";
import { exactMarkSpec } from "./exact";
import type { ElementNode, Node, MarkSpec, PMMark } from "../types";

// #region exact-match marks

/** bold ↔ Comark `strong` (also reads `b`). */
export const boldSpec = exactMarkSpec("bold", "strong", ["b"]);

/** italic ↔ Comark `em` (also reads `i`). */
export const italicSpec = exactMarkSpec("italic", "em", ["i"]);

/** strike ↔ Comark `del`. Comark canonicalises strikethrough to `<del>` on parse; `s`/`strike` are read for hand-authored ASTs. */
export const strikeSpec = exactMarkSpec("strike", "del", ["s", "strike"]);

/** code (inline) ↔ Comark `code`. */
export const codeSpec = exactMarkSpec("code", "code");

// #region link

/* Stock `@tiptap/extension-link` exposes href/title/target/rel/class as native PM attrs; mirror them so the upstream Link extension works. Anything else on `<a>` flows through `htmlAttrs`. */
const LINK_SEMANTIC = ["href", "title", "target", "rel", "class"] as const;

/** link ↔ Comark `a`. */
export const linkSpec: MarkSpec = {
  pmName: "link",
  tags: ["a"],

  toComark(mark: PMMark, children: Node[]): ElementNode {
    const semantic: Record<string, unknown> = {
      href: (mark.attrs?.href as string | undefined) ?? "",
    };
    if (mark.attrs?.title != null && mark.attrs.title !== "") semantic.title = mark.attrs.title;
    if (mark.attrs?.target != null && mark.attrs.target !== "") semantic.target = mark.attrs.target;
    if (mark.attrs?.rel != null && mark.attrs.rel !== "") semantic.rel = mark.attrs.rel;
    if (mark.attrs?.class != null && mark.attrs.class !== "") semantic.class = mark.attrs.class;
    const attrs = mergeAttrs(semantic, readHtmlAttrsBag(mark));
    return ["a", attrs, ...children];
  },

  fromComark(el: ElementNode): PMMark {
    const { semantic, htmlAttrs } = splitAttrs(el[1], LINK_SEMANTIC);
    const attrs: Record<string, unknown> = {
      href: (semantic.href as string | undefined) ?? "",
      title: (semantic.title as string | null | undefined) ?? null,
    };
    if (semantic.target != null) attrs.target = semantic.target;
    if (semantic.rel != null) attrs.rel = semantic.rel;
    if (semantic.class != null) attrs.class = semantic.class;
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    return { type: "link", attrs };
  },
};
