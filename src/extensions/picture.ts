import { Node, mergeAttributes } from "@tiptap/core";
import type { ResolveSrc } from "../types";
import { collectDomAttrs } from "../utils/html-attrs";
import { RAW_SRC_ATTR, RAW_SRCSET_ATTR, displayUrlAttrs } from "../utils/resolve-src";

export interface ComarkPictureOptions {
  /**
   * Display-only URL resolver for source/img URLs; see {@link ResolveSrc}.
   * @default undefined
   */
  resolveSrc: ResolveSrc | undefined;
}

/** Attr bag of one `<source>` / the inner `<img>`, preserved verbatim. */
type AttrBag = Record<string, unknown>;

/** A source/img child's attrs, preferring the raw `data-comark-*` stashes over resolved values. */
function harvestChildAttrs(el: Element): Record<string, string> {
  const out = collectDomAttrs(el as HTMLElement);
  const rawSrc = el.getAttribute(RAW_SRC_ATTR);
  const rawSrcset = el.getAttribute(RAW_SRCSET_ATTR);
  if (rawSrc != null) out.src = rawSrc;
  if (rawSrcset != null) out.srcset = rawSrcset;
  return out;
}

/** An attr bag rendered for display: primitives stringified, URLs resolved. */
function displayBag(bag: AttrBag, resolve: ResolveSrc | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
      out[k] = String(v);
    }
  }
  if (out.src != null) Object.assign(out, displayUrlAttrs("src", out.src, "picture", resolve));
  if (out.srcset != null) {
    Object.assign(out, displayUrlAttrs("srcset", out.srcset, "picture", resolve));
  }
  return out;
}

/**
 * Opaque inline atom for `<picture>`: sources and the inner img ride
 * verbatim in `attrs`; selectable/deletable, not editable from within.
 * Inline is forced — comark emits pictures both block-level and inside text
 * runs, and a block-group node would be schema-dropped in the latter (block
 * pictures round-trip paragraph-wrapped instead, like bare imgs). The
 * `htmlAttrs` bag comes globally from `ComarkAttrs`.
 */
export const ComarkPicture = Node.create<ComarkPictureOptions>({
  name: "picture",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      resolveSrc: undefined,
    };
  },

  addAttributes() {
    return {
      sources: {
        default: [] as AttrBag[],
        parseHTML: (el) => Array.from(el.querySelectorAll("source")).map(harvestChildAttrs),
        renderHTML: () => ({}),
      },
      img: {
        default: null as AttrBag | null,
        parseHTML: (el) => {
          const img = el.querySelector("img");
          return img ? harvestChildAttrs(img) : null;
        },
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "picture" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const resolve = this.options.resolveSrc;
    const sources = ((node.attrs.sources as AttrBag[] | null | undefined) ?? []).map(
      (s) => ["source", displayBag(s, resolve)] as const,
    );
    const img = node.attrs.img as AttrBag | null | undefined;
    return [
      "picture",
      mergeAttributes(HTMLAttributes),
      ...sources,
      ...(img ? [["img", displayBag(img, resolve)] as const] : []),
    ];
  },
});
