/** One entry of a `srcset` candidate list: a URL plus its optional `2x`/`640w` descriptor. */
export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

/**
 * Parse a `srcset` candidate list (WHATWG grammar): comma-separated, each a
 * whitespace-free URL plus optional descriptor. A comma glued to a URL's
 * tail (`a.png, b.png`) ends its candidate; one with no whitespace around
 * it (`a.png,b.png`) is part of the URL — matching browser parsing.
 */
export function parseSrcset(srcset: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && (srcset.charAt(i) === "," || /\s/.test(srcset.charAt(i)))) i++;
    if (i >= srcset.length) break;
    let start = i;
    while (i < srcset.length && !/\s/.test(srcset.charAt(i))) i++;
    let url = srcset.slice(start, i);
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      while (i < srcset.length && /\s/.test(srcset.charAt(i))) i++;
      start = i;
      while (i < srcset.length && srcset.charAt(i) !== ",") i++;
      descriptor = srcset.slice(start, i).trim();
      i++;
    }
    if (url.length > 0) out.push({ url, descriptor });
  }
  return out;
}

/**
 * Map every URL of a `srcset` through `resolve`, preserving descriptors.
 * URLs the resolver declines (`undefined`) stay as-is. Whitespace is
 * normalized to `url desc, url desc`; an unparseable value returns verbatim.
 */
export function resolveSrcset(
  srcset: string,
  resolve: (url: string) => string | undefined,
): string {
  const candidates = parseSrcset(srcset);
  if (candidates.length === 0) return srcset;
  return candidates
    .map(({ url, descriptor }) => {
      const resolved = resolve(url) ?? url;
      return descriptor ? `${resolved} ${descriptor}` : resolved;
    })
    .join(", ");
}
