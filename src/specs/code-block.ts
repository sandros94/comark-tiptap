import { mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from "../types";

const SEMANTIC_KEYS = ["language", "filename", "highlights", "meta"] as const;

/** codeBlock ↔ Comark `pre` wrapping an inner `code`. */
export const codeBlockSpec: NodeSpec = {
  pmName: "codeBlock",
  tags: ["pre"],

  toComark(node: JSONContent): ComarkElement {
    const semantic: Record<string, unknown> = {};
    if (node.attrs?.language) semantic.language = node.attrs.language;
    /* `!= null`: an explicit empty `filename`/`meta` (or `meta: 0`) is still user intent. */
    if (node.attrs?.filename != null) semantic.filename = node.attrs.filename;
    if (Array.isArray(node.attrs?.highlights) && node.attrs.highlights.length > 0) {
      semantic.highlights = node.attrs.highlights;
    }
    if (node.attrs?.meta != null) semantic.meta = node.attrs.meta;

    const preAttrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );

    const text = (node.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
      .join("");

    const codeAttrs: Record<string, unknown> = {};
    if (node.attrs?.language) codeAttrs.class = `language-${node.attrs.language}`;
    /* codeHtmlAttrs stay separate so the inner `<code>` can be styled independently of the outer `<pre>`. */
    const codeHtmlAttrs = node.attrs?.codeHtmlAttrs as Record<string, unknown> | undefined;
    if (codeHtmlAttrs) {
      for (const [k, v] of Object.entries(codeHtmlAttrs)) {
        if (v === null || v === undefined) continue;
        if (k === "class" && v === codeAttrs.class) continue;
        codeAttrs[k] = v;
      }
    }

    return ["pre", preAttrs, ["code", codeAttrs, text] as ComarkElement];
  },

  fromComark(el: ComarkElement, _h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;

    /* Inner `<code>` is always emitted by real Comark; handle hand-authored ASTs that omit it. */
    const inner = children.find((c): c is ComarkElement => Array.isArray(c) && c[0] === "code");
    let text = "";
    let codeAttrs: ComarkElement[1] | undefined;
    if (inner) {
      codeAttrs = inner[1];
      for (const c of inner.slice(2) as unknown[]) {
        if (typeof c === "string") text += c;
      }
    } else {
      for (const c of children) if (typeof c === "string") text += c;
    }

    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, SEMANTIC_KEYS);

    const attrs: Record<string, unknown> = {};
    if (typeof semantic.language === "string") attrs.language = semantic.language;
    if (typeof semantic.filename === "string") attrs.filename = semantic.filename;
    if (Array.isArray(semantic.highlights)) attrs.highlights = semantic.highlights;
    if (semantic.meta != null) attrs.meta = semantic.meta;
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;

    // Capture inner-`<code>` attrs that aren't the reconstructable `language-{lang}` class.
    if (codeAttrs) {
      const codeHtmlAttrs: Record<string, unknown> = {};
      const lang = typeof attrs.language === "string" ? attrs.language : "";
      for (const [k, v] of Object.entries(codeAttrs)) {
        if (k === "$") continue;
        if (v === null || v === undefined) continue;
        if (k === "class" && lang && v === `language-${lang}`) continue;
        codeHtmlAttrs[k] = v;
      }
      if (Object.keys(codeHtmlAttrs).length > 0) attrs.codeHtmlAttrs = codeHtmlAttrs;
    }

    const out: JSONContent = { type: "codeBlock" };
    if (Object.keys(attrs).length > 0) out.attrs = attrs;
    if (text.length > 0) out.content = [{ type: "text", text }];
    return out;
  },
};
