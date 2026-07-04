/**
 * The kit's CSS, as a string — pipe it into an SSR `<style>` tag, a
 * CSP-nonce'd injection, a Shadow DOM, or a custom build step.
 */
export const comarkStyle = `[data-comark-comment]:not([data-node-view-wrapper]) {
  display: block;
  padding: 0.25em 0.5em;
  margin: 0.5em 0;
  border-left: 3px solid currentColor;
  opacity: 0.6;
  font-style: italic;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
}

[data-comark-comment]:not([data-node-view-wrapper])::before {
  content: "// " attr(data-comark-comment);
}

[data-comark-template]:not([data-node-view-wrapper]) {
  display: block;
  position: relative;
  padding: 0.5em;
  margin: 0.5em 0;
  border: 1px dashed currentColor;
  opacity: 0.85;
}

[data-comark-template]:not([data-node-view-wrapper])[data-slot]::before {
  content: "#" attr(data-slot);
  display: block;
  margin-bottom: 0.25em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75em;
  opacity: 0.65;
}

div[data-comark-component]:not([data-node-view-wrapper]) {
  display: block;
  position: relative;
  padding: 0.5em;
  margin: 0.5em 0;
  border: 1px solid currentColor;
  opacity: 0.85;
}

div[data-comark-component]:not([data-node-view-wrapper])::before {
  content: "::" attr(data-comark-component);
  display: block;
  margin-bottom: 0.25em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75em;
  opacity: 0.65;
}

span[data-comark-component]:not([data-node-view-wrapper]) {
  display: inline;
  padding: 0 0.25em;
  border: 1px solid currentColor;
  border-radius: 0.25em;
  opacity: 0.85;
}
`;

/**
 * Data-attribute marking the auto-injected `<style>` tag; a single tag is
 * shared per document.
 */
export const COMARK_STYLE_MARKER = "data-comark-style";

/**
 * Idempotently inserts the kit stylesheet into `document.head`, returning
 * the existing tag if one is already present. No-op when `document` is
 * undefined (SSR / Node test runners).
 *
 * @param nonce - CSP nonce to set on a newly created `<style>` tag.
 * @returns The `<style>` element, or `null` under SSR.
 */
export function injectComarkStyles(nonce?: string): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;

  const existing = document.querySelector<HTMLStyleElement>(`style[${COMARK_STYLE_MARKER}]`);
  if (existing) return existing;

  const styleNode = document.createElement("style");
  styleNode.setAttribute(COMARK_STYLE_MARKER, "");
  if (nonce) styleNode.setAttribute("nonce", nonce);
  styleNode.textContent = comarkStyle;
  document.head.appendChild(styleNode);
  return styleNode;
}
