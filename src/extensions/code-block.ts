import { mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CodeBlock } from "@tiptap/extension-code-block";

/**
 * Stock `CodeBlock` extended with Comark-specific attrs. None render as
 * HTML attributes on `<pre>`; the serializer round-trips them through
 * Comark's element-attrs bag, so each is declared `renderHTML: () => ({})`.
 *
 *   - `filename`      — `[name.ext]` between language and meta
 *   - `highlights`    — `{1,3-5}` line ranges
 *   - `meta`          — anything else after the open fence
 *   - `codeHtmlAttrs` — extra attrs on the inner `<code>`
 */
export const ComarkCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      filename: { default: null, renderHTML: () => ({}) },
      highlights: { default: null, renderHTML: () => ({}) },
      meta: { default: null, renderHTML: () => ({}) },
      codeHtmlAttrs: { default: null, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full" as const,
        /*
         * Capture extra attrs on the inner `<code>` (e.g. `data-line-numbers`)
         * so they survive a DOM round-trip. Drop the `language-{lang}` class —
         * it duplicates `node.attrs.language` and is recomputed on render —
         * and skip kit-internal `data-comark-*` markers and PM's `data-pm-*`.
         */
        getAttrs(el: HTMLElement | string) {
          if (!(el instanceof HTMLElement)) return false;
          const code = el.querySelector("code");
          if (!code) return null;
          const inferredLang = (() => {
            const cls = code.getAttribute("class") ?? "";
            const m = /language-(\S+)/.exec(cls);
            return m ? m[1] : null;
          })();
          const out: Record<string, string> = {};
          for (const attr of Array.from(code.attributes)) {
            if (attr.name === "class" && inferredLang && attr.value === `language-${inferredLang}`)
              continue;
            if (attr.name.startsWith("data-pm-")) continue;
            if (attr.name.startsWith("data-comark-")) continue;
            out[attr.name] = attr.value;
          }
          return Object.keys(out).length > 0 ? { codeHtmlAttrs: out } : null;
        },
      },
    ];
  },

  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: ProseMirrorNode;
    HTMLAttributes: Record<string, unknown>;
  }) {
    const lang = node.attrs.language as string | null | undefined;
    const extra = (node.attrs.codeHtmlAttrs as Record<string, unknown> | null | undefined) ?? null;
    const codeAttrs: Record<string, unknown> = {};
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "string") codeAttrs[k] = v;
        else if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
          codeAttrs[k] = String(v);
        }
      }
    }
    // Splice `language-{lang}` back onto `<code>` (dropped on parse).
    if (lang) codeAttrs.class = `language-${lang}`;
    return ["pre", mergeAttributes(HTMLAttributes), ["code", codeAttrs, 0]];
  },
});
