import type { ComarkElementAttributes } from "../types";

/** Drop nullish values; never include the `$` parser metadata. */
export function cleanAttrs(attrs: ComarkElementAttributes | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "$") continue;
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Split Comark element attrs into (semantic, htmlAttrs).
 *
 *   semantic:  keys the spec declares natively on the PM schema
 *   htmlAttrs: the rest — class, id, data-*, aria-*, custom, … —
 *              destined for the global `htmlAttrs` PM attr
 *
 * Skips `$` and nullish entries.
 */
export function splitAttrs(
  attrs: ComarkElementAttributes | undefined,
  semanticKeys: readonly string[],
): {
  semantic: Record<string, unknown>;
  htmlAttrs: Record<string, unknown>;
} {
  const semantic: Record<string, unknown> = {};
  const htmlAttrs: Record<string, unknown> = {};
  if (!attrs) return { semantic, htmlAttrs };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "$") continue;
    if (v === null || v === undefined) continue;
    if (semanticKeys.includes(k)) semantic[k] = v;
    else htmlAttrs[k] = v;
  }
  return { semantic, htmlAttrs };
}

/**
 * Merge a node/mark's semantic attrs with its `htmlAttrs` bag back into a
 * single Comark element-attrs object. Semantic keys win on collision.
 */
export function mergeAttrs(
  semantic: Record<string, unknown>,
  htmlAttrs: Record<string, unknown> | undefined,
): ComarkElementAttributes {
  const out: ComarkElementAttributes = {};
  if (htmlAttrs) {
    for (const [k, v] of Object.entries(htmlAttrs)) {
      if (v === null || v === undefined) continue;
      out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(semantic)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Whether a node's `htmlAttrs` bag is effectively empty — both a missing bag
 * and `{}` count as empty.
 */
export function hasNoHtmlAttrs(
  node: { attrs?: { htmlAttrs?: unknown } } | null | undefined,
): boolean {
  if (!node) return true;
  const html = node.attrs?.htmlAttrs as Record<string, unknown> | null | undefined;
  if (!html) return true;
  if (typeof html !== "object") return true;
  // PM fills the `{}` default on any DOM round-trip, so `{}` means attrless.
  return Object.keys(html).length === 0;
}

/**
 * Value-equality of two `htmlAttrs` Records, ignoring keys whose value is
 * nullish (so `{ class: 'a' }` and `{ class: 'a', id: undefined }` compare
 * equal).
 */
export function attrsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const ak = Object.keys(a ?? {}).filter((k) => (a as Record<string, unknown>)[k] != null);
  const bk = Object.keys(b ?? {}).filter((k) => (b as Record<string, unknown>)[k] != null);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}
