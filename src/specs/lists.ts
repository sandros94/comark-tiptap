import { mergeAttrs, splitAttrs } from "../utils/attrs";
import { autoUnwrapBlocks } from "../utils/auto-unwrap";
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from "../types";

/* A fresh minimal `listItem` for a would-be-empty list — PM's list schema is
   `listItem+`, so a childless `ul`/`ol` (e.g. `- \n` → `['ul',{}]`) is invalid
   without one. A new object per call: PM must not share node references. */
const EMPTY_LIST_ITEM = (): JSONContent => ({
  type: "listItem",
  content: [{ type: "paragraph" }],
});

// #region listItem

/** listItem ↔ Comark `li`. */
export const listItemSpec: NodeSpec = {
  pmName: "listItem",
  tags: ["li"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    /*
     * Comark's list-item autoUnwrap: a single attrless paragraph flattens to
     * inlines (`['li',{},'x']`); anything else — multiple blocks, or a
     * paragraph plus a nested list — keeps its block wrappers. DOM-roundtripped
     * paragraphs (PM-default `htmlAttrs: {}`) still count as attrless.
     */
    return ["li", attrs, ...autoUnwrapBlocks(node.content, h)];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);

    const content = h.parseBlocks(children);
    if (content.length === 0) content.push({ type: "paragraph" });

    const out: JSONContent = { type: "listItem", content };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};

// #region bulletList

/** bulletList ↔ Comark `ul`. */
export const bulletListSpec: NodeSpec = {
  pmName: "bulletList",
  tags: ["ul"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["ul", attrs, ...h.serializeBlocks(node.content)];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const items = h.parseBlocks(children).filter((c) => c.type === "listItem");
    const out: JSONContent = {
      type: "bulletList",
      content: items.length > 0 ? items : [EMPTY_LIST_ITEM()],
    };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};

// #region orderedList

const ORDERED_LIST_SEMANTIC = ["start"] as const;

/** orderedList ↔ Comark `ol`. */
export const orderedListSpec: NodeSpec = {
  pmName: "orderedList",
  tags: ["ol"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const semantic: Record<string, unknown> = {};
    /* Comark stores `start` as a string ("5") for round-trip stability; mirror that on output. */
    const startRaw = node.attrs?.start;
    if (startRaw != null && String(startRaw) !== "1") {
      semantic.start = String(startRaw);
    }
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["ol", attrs, ...h.serializeBlocks(node.content)];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, ORDERED_LIST_SEMANTIC);
    const attrs: Record<string, unknown> = {};
    /* Comark carries `start` as a string; PM's OrderedList schema types it as a
       number (its renderHTML/join do numeric comparisons), so coerce here. */
    if (semantic.start != null) {
      const start = Number(semantic.start);
      if (Number.isFinite(start)) attrs.start = start;
    }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;
    const items = h.parseBlocks(children).filter((c) => c.type === "listItem");
    const out: JSONContent = {
      type: "orderedList",
      content: items.length > 0 ? items : [EMPTY_LIST_ITEM()],
    };
    if (Object.keys(attrs).length > 0) out.attrs = attrs;
    return out;
  },
};
