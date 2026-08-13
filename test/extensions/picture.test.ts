/**
 * @vitest-environment happy-dom
 *
 * ComarkPicture: opaque inline atom preserving `<picture>` sources through
 * the editor — AST round-trip lossless (the pre-fix kit silently deleted
 * `source` elements), display resolution via `resolveSrc`, raw values
 * recovered from clipboard-equivalent DOM round-trips.
 */

import { Editor, generateJSON } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { ComarkKit, type ComarkKitOptions } from "../../src/kit";
import type { MarkdownDocument, JSONContent, ResolveSrc } from "../../src/types";

const CDN = "https://cdn.example";
const resolveSrc: ResolveSrc = (src) => (src.startsWith("public/") ? `${CDN}/${src}` : undefined);

const PICTURE = [
  "picture",
  {},
  ["source", { srcset: "public/a.avif 1x, public/a-2x.avif 2x", type: "image/avif" }],
  ["source", { srcset: "public/a.webp", type: "image/webp" }],
  ["img", { src: "public/a.jpg", alt: "x" }],
] as MarkdownDocument["nodes"][number];

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

describe("AST round-trip", () => {
  it("preserves a standalone picture losslessly (sole-child paragraph hoists back out)", () => {
    const editor = makeEditor();
    editor.commands.setComarkAst(tree([PICTURE]));
    // Inline atom in PM, but an attrless paragraph whose only child is a
    // picture serializes back to the bare top-level element (context: 'inline-block').
    expect(getAst(editor).nodes).toEqual([PICTURE]);
    editor.destroy();
  });

  it("preserves an inline picture inside a text run", () => {
    const editor = makeEditor();
    const para = ["p", {}, "see ", PICTURE, " here"] as MarkdownDocument["nodes"][number];
    editor.commands.setComarkAst(tree([para]));
    expect(getAst(editor).nodes).toEqual([para]);
    editor.destroy();
  });

  it("drops ONLY the picture node when `picture: false`, reporting via onError", () => {
    // Regression guard: a schema-unknown node used to fail Tiptap's content
    // check and reset the WHOLE document, not just the offending node.
    const dropped: string[] = [];
    const editor = makeEditor({
      picture: false,
      serializer: { onError: (err: unknown) => dropped.push(String(err)) },
    });
    editor.commands.setComarkAst(tree([["p", {}, "before"], PICTURE, ["p", {}, "after"]]));
    expect(getAst(editor).nodes).toEqual([
      ["p", {}, "before"],
      ["p", {}],
      ["p", {}, "after"],
    ]);
    expect(dropped.join()).toContain('disabled type "picture"');
    editor.destroy();
  });
});

describe("editor DOM", () => {
  it("renders the real picture structure; resolver maps sources and img for display", () => {
    const editor = makeEditor({ resolveSrc });
    editor.commands.setComarkAst(tree([PICTURE]));
    const picture = editor.view.dom.querySelector("picture");
    if (!picture) throw new Error("no <picture> in editor DOM");
    const sources = Array.from(picture.querySelectorAll("source"));
    expect(sources.map((s) => s.getAttribute("srcset"))).toEqual([
      `${CDN}/public/a.avif 1x, ${CDN}/public/a-2x.avif 2x`,
      `${CDN}/public/a.webp`,
    ]);
    expect(picture.querySelector("img")?.getAttribute("src")).toBe(`${CDN}/public/a.jpg`);
    // Stored attrs stay raw regardless.
    expect(getAst(editor).nodes).toEqual([PICTURE]);
    editor.destroy();
  });

  it("renders verbatim with no resolver", () => {
    const editor = makeEditor();
    editor.commands.setComarkAst(tree([PICTURE]));
    const source = editor.view.dom.querySelector("picture source");
    expect(source?.getAttribute("srcset")).toBe("public/a.avif 1x, public/a-2x.avif 2x");
    editor.destroy();
  });
});

describe("resolved display HTML round-trips back to raw values", () => {
  it("re-parsing getHTML() recovers raw sources via the data-comark stashes", () => {
    const editor = makeEditor({ resolveSrc });
    editor.commands.setComarkAst(tree([PICTURE]));
    const html = editor.getHTML();
    expect(html).toContain(`${CDN}/public/a.jpg`);
    const pm = generateJSON(html, [ComarkKit.configure({ resolveSrc })]) as JSONContent;
    const picture = pm.content?.[0]?.content?.[0];
    expect(picture?.type).toBe("picture");
    expect(picture?.attrs?.sources).toEqual([
      { srcset: "public/a.avif 1x, public/a-2x.avif 2x", type: "image/avif" },
      { srcset: "public/a.webp", type: "image/webp" },
    ]);
    expect(picture?.attrs?.img).toEqual({ src: "public/a.jpg", alt: "x" });
    editor.destroy();
  });

  it("keeps the picture tag's own htmlAttrs through the DOM", () => {
    const editor = makeEditor();
    const withClass = [
      "picture",
      { class: "hero" },
      ["source", { srcset: "public/a.webp" }],
      ["img", { src: "public/a.jpg" }],
    ] as MarkdownDocument["nodes"][number];
    editor.commands.setComarkAst(tree([withClass]));
    const pm = generateJSON(editor.getHTML(), [ComarkKit]) as JSONContent;
    const picture = pm.content?.[0]?.content?.[0];
    expect(picture?.attrs?.htmlAttrs).toEqual({ class: "hero" });
    expect(getAst(editor).nodes).toEqual([withClass]);
    editor.destroy();
  });
});
