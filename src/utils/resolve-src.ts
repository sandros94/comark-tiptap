import type { ResolveSrc, ResolveSrcContext } from "../types";
import { resolveSrcset } from "./srcset";

/**
 * Raw-value stashes for resolver-changed `src`/`srcset`. PM's clipboard
 * serializes the display DOM, so without these an internal copy-paste would
 * bake resolved URLs into the document; parse paths prefer the stash. The
 * `data-comark-` prefix is already excluded from `htmlAttrs` harvesting.
 */
export const RAW_SRC_ATTR = "data-comark-src";
export const RAW_SRCSET_ATTR = "data-comark-srcset";

/**
 * Display attributes for one URL-bearing attr: the resolved value, plus the
 * raw stash when — and only when — the resolver changed it. Without a
 * resolver: exactly `{ [attr]: value }` (stock rendering).
 */
export function displayUrlAttrs(
  attr: ResolveSrcContext["attr"],
  value: string,
  node: ResolveSrcContext["node"],
  resolve: ResolveSrc | undefined,
): Record<string, string> {
  if (!resolve) return { [attr]: value };
  const display =
    attr === "src"
      ? (resolve(value, { attr, node }) ?? value)
      : resolveSrcset(value, (url) => resolve(url, { attr, node }));
  if (display === value) return { [attr]: value };
  return { [attr]: display, [attr === "src" ? RAW_SRC_ATTR : RAW_SRCSET_ATTR]: value };
}
