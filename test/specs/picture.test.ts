import { describe, expect, it } from "vitest";
import { createSerializer } from "../../src/serializer";
import { paragraphSpec } from "../../src/specs/paragraph";
import { pictureSpec } from "../../src/specs/picture";
import type { ComarkElement } from "../../src/types";

const helpers = createSerializer({
  nodes: [paragraphSpec, pictureSpec],
  marks: [],
});

describe("pictureSpec", () => {
  it("round-trips sources and the inner img verbatim", () => {
    const original: ComarkElement = [
      "picture",
      {},
      ["source", { srcset: "public/a.avif", type: "image/avif" }],
      ["source", { srcset: "public/a.webp", type: "image/webp" }],
      ["img", { src: "public/a.jpg", alt: "x", width: "800" }],
    ];
    const pm = pictureSpec.fromComark(original, helpers)!;
    expect(pm).toEqual({
      type: "picture",
      attrs: {
        sources: [
          { srcset: "public/a.avif", type: "image/avif" },
          { srcset: "public/a.webp", type: "image/webp" },
        ],
        img: { src: "public/a.jpg", alt: "x", width: "800" },
      },
    });
    expect(pictureSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("keeps the picture tag's own attrs in htmlAttrs and strips `$` bookkeeping", () => {
    const original: ComarkElement = [
      "picture",
      { $: { html: 1, block: 1 }, class: "hero" },
      ["source", { $: { html: 1, block: 1 }, srcset: "public/a.avif" }],
      ["img", { $: { html: 1, block: 1 }, src: "public/a.jpg" }],
    ] as unknown as ComarkElement;
    const pm = pictureSpec.fromComark(original, helpers)!;
    expect(pm.attrs).toEqual({
      sources: [{ srcset: "public/a.avif" }],
      img: { src: "public/a.jpg" },
      htmlAttrs: { class: "hero" },
    });
    expect(pictureSpec.toComark(pm, helpers)).toEqual([
      "picture",
      { class: "hero" },
      ["source", { srcset: "public/a.avif" }],
      ["img", { src: "public/a.jpg" }],
    ]);
  });

  it("normalizes child order to sources-then-img; first img wins; text dropped", () => {
    const original = [
      "picture",
      {},
      "\n  ",
      ["img", { src: "public/first.jpg" }],
      ["source", { srcset: "public/a.avif" }],
      ["img", { src: "public/second.jpg" }],
    ] as unknown as ComarkElement;
    const pm = pictureSpec.fromComark(original, helpers)!;
    expect(pictureSpec.toComark(pm, helpers)).toEqual([
      "picture",
      {},
      ["source", { srcset: "public/a.avif" }],
      ["img", { src: "public/first.jpg" }],
    ]);
  });

  it("round-trips an img-less picture without inventing an img", () => {
    const original: ComarkElement = ["picture", {}, ["source", { srcset: "public/a.avif" }]];
    const pm = pictureSpec.fromComark(original, helpers)!;
    expect(pm.attrs?.img).toBeNull();
    expect(pictureSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("round-trips an inline picture inside a paragraph", () => {
    const original: ComarkElement = [
      "p",
      {},
      "see ",
      ["picture", {}, ["source", { srcset: "public/a.avif" }], ["img", { src: "public/a.jpg" }]],
      " here",
    ];
    const pm = paragraphSpec.fromComark(original, helpers)!;
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original);
  });
});
