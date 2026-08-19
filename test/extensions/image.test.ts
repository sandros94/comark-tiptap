/**
 * @vitest-environment happy-dom
 *
 * ComarkImage display resolution (`resolveSrc`): the editor DOM shows
 * resolved URLs while `node.attrs` and the Comark AST keep the raw stored
 * value — across the plain render path, the resize node view, `srcset`
 * candidates, and clipboard-equivalent DOM round-trips.
 */

import { Editor, generateJSON } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { ComarkKit, type ComarkKitOptions } from "../../src/kit";
import type { MarkdownDocument, JSONContent, ResolveSrc } from "../../src/types";

const RAW_SRC = "public/products/pump_123e4567.webp";
const CDN = "https://cdn.example";

const resolveSrc: ResolveSrc = (src) => (src.startsWith("public/") ? `${CDN}/${src}` : undefined);

function tree(nodes: MarkdownDocument["nodes"]): MarkdownDocument {
  return { nodes, frontmatter: {}, meta: {} };
}

function makeEditor(options: Partial<ComarkKitOptions> = {}): Editor {
  return new Editor({
    element: document.createElement("div"),
    extensions: [ComarkKit.configure(options)],
    content: "",
  });
}

function getAst(editor: Editor): MarkdownDocument {
  return (editor.storage as { comark: { getAst(): MarkdownDocument } }).comark.getAst();
}

function editorImg(editor: Editor): HTMLImageElement {
  const img = editor.view.dom.querySelector("img");
  if (!img) throw new Error("no <img> in editor DOM");
  return img as HTMLImageElement;
}

const IMG_TREE = tree([["p", {}, ["img", { src: RAW_SRC, alt: "x" }]]]);

describe("resolveSrc on src", () => {
  for (const resize of [false, true]) {
    it(`resolves the DOM src and keeps the AST raw (resize: ${resize})`, () => {
      const editor = makeEditor({
        resolveSrc,
        ...(resize ? { image: { resize: { enabled: true } } } : {}),
      });
      editor.commands.setComarkAst(IMG_TREE);
      expect(editorImg(editor).getAttribute("src")).toBe(`${CDN}/${RAW_SRC}`);
      expect(getAst(editor).nodes).toEqual([["p", {}, ["img", { alt: "x", src: RAW_SRC }]]]);
      editor.destroy();
    });
  }

  it("leaves the raw src when the resolver returns undefined", () => {
    const editor = makeEditor({ resolveSrc });
    editor.commands.setComarkAst(tree([["p", {}, ["img", { src: "https://other.host/x.png" }]]]));
    expect(editorImg(editor).getAttribute("src")).toBe("https://other.host/x.png");
    editor.destroy();
  });

  it("renders verbatim with no resolver configured (no stash attrs either)", () => {
    const editor = makeEditor();
    editor.commands.setComarkAst(IMG_TREE);
    expect(editorImg(editor).getAttribute("src")).toBe(RAW_SRC);
    expect(editor.getHTML()).not.toContain("data-comark-src");
    editor.destroy();
  });
});

describe("resolveSrc on srcset (first-class image attr)", () => {
  const SRCSET = "public/a.webp 1x, public/a-2x.webp 2x";

  it("resolves each candidate for display; AST keeps the raw srcset", () => {
    const editor = makeEditor({ resolveSrc });
    editor.commands.setComarkAst(tree([["p", {}, ["img", { src: RAW_SRC, srcset: SRCSET }]]]));
    expect(editorImg(editor).getAttribute("srcset")).toBe(
      `${CDN}/public/a.webp 1x, ${CDN}/public/a-2x.webp 2x`,
    );
    expect(getAst(editor).nodes).toEqual([["p", {}, ["img", { src: RAW_SRC, srcset: SRCSET }]]]);
    editor.destroy();
  });

  it("renders srcset verbatim with no resolver", () => {
    const editor = makeEditor();
    editor.commands.setComarkAst(tree([["p", {}, ["img", { src: RAW_SRC, srcset: SRCSET }]]]));
    expect(editorImg(editor).getAttribute("srcset")).toBe(SRCSET);
    editor.destroy();
  });
});

describe("resolved display HTML round-trips back to raw values", () => {
  it("getHTML() emits resolved URLs plus raw stashes; re-parsing recovers raw", () => {
    const editor = makeEditor({ resolveSrc });
    editor.commands.setComarkAst(
      tree([["p", {}, ["img", { src: RAW_SRC, srcset: "public/a.webp 2x" }]]]),
    );
    const html = editor.getHTML();
    // Display HTML carries the resolved URLs (documented behavior) …
    expect(html).toContain(`src="${CDN}/${RAW_SRC}"`);
    // … and the raw stashes, so PM's clipboard (which serializes this same
    // DOM) never bakes resolved URLs into the document on internal copy-paste.
    const pm = generateJSON(html, [ComarkKit.configure({ resolveSrc })]) as JSONContent;
    const img = pm.content?.[0]?.content?.[0];
    expect(img?.attrs?.src).toBe(RAW_SRC);
    expect(img?.attrs?.srcset).toBe("public/a.webp 2x");
    editor.destroy();
  });
});
