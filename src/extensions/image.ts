import { Image, type ImageOptions } from "@tiptap/extension-image";
import type { ResolveSrc } from "../types";
import { RAW_SRC_ATTR, RAW_SRCSET_ATTR, displayUrlAttrs } from "../utils/resolve-src";

export interface ComarkImageOptions extends ImageOptions {
  /**
   * Display-only URL resolver for `src` and `srcset`; see {@link ResolveSrc}.
   * @default undefined
   */
  resolveSrc: ResolveSrc | undefined;
}

/**
 * Stock `Image` with Comark display resolution (node name stays `image`, so
 * `imageSpec` applies unchanged). `src`/`srcset` resolve in attribute-level
 * `renderHTML` — the one seam that also covers the resize node view, whose
 * `HTMLAttributes` come from `getRenderedAttributes(...)`. `srcset` is
 * first-class (reserved in `ComarkAttrs`) instead of riding `htmlAttrs`.
 * Parse prefers the `data-comark-src(set)` raw stashes — see `resolve-src.ts`.
 */
export const ComarkImage = Image.extend<ComarkImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() ?? ({} as ImageOptions)),
      resolveSrc: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute(RAW_SRC_ATTR) ?? el.getAttribute("src"),
        renderHTML: (attrs: { src?: unknown }) => {
          const src = attrs.src;
          if (src == null) return {};
          if (typeof src !== "string") return { src };
          return displayUrlAttrs("src", src, "image", this.options.resolveSrc);
        },
      },
      srcset: {
        default: null,
        parseHTML: (el) => el.getAttribute(RAW_SRCSET_ATTR) ?? el.getAttribute("srcset"),
        renderHTML: (attrs: { srcset?: unknown }) => {
          const srcset = attrs.srcset;
          if (srcset == null) return {};
          if (typeof srcset !== "string") return { srcset };
          return displayUrlAttrs("srcset", srcset, "image", this.options.resolveSrc);
        },
      },
    };
  },
});
