import { describe, expect, it } from "vitest";
import { paragraphSpec } from "../../src/specs/paragraph";
import { pictureSpec } from "../../src/specs/picture";
import { createSerializer } from "../../src/serializer";
import type { ElementNode, JSONContent } from "../../src/types";
import { blockquoteSpec } from "../../src/specs/blockquote";

const helpers = createSerializer({
  nodes: [blockquoteSpec, paragraphSpec],
  marks: [],
});

describe("blockquoteSpec", () => {
  it("round-trips a blockquote with a single paragraph child (autoUnwrapped form)", () => {
    // Comark's parser emits the autoUnwrapped form for single-paragraph
    // containers; we mirror it on the way out.
    const original: ElementNode = ["blockquote", {}, "Q"];
    const pm = blockquoteSpec.fromComark(original, helpers)!;
    expect(pm).toEqual({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Q" }] }],
    });
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("round-trips the wrapped form too — `[blockquote, {}, [p, {}, Q]]` is also valid input", () => {
    const original: ElementNode = ["blockquote", {}, ["p", {}, "Q"]];
    const pm = blockquoteSpec.fromComark(original, helpers)!;
    // Output is the autoUnwrapped form (Comark's canonical).
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(["blockquote", {}, "Q"]);
  });

  it("preserves htmlAttrs (`data-cite` etc.) on the blockquote element", () => {
    const original: ElementNode = ["blockquote", { "data-cite": "rfc" }, "Q"];
    const pm = blockquoteSpec.fromComark(original, helpers)!;
    expect(pm.attrs).toEqual({ htmlAttrs: { "data-cite": "rfc" } });
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("keeps both paragraphs wrapped when there are multiple", () => {
    const original: ElementNode = ["blockquote", {}, ["p", {}, "A"], ["p", {}, "B"]];
    const pm = blockquoteSpec.fromComark(original, helpers)!;
    expect(pm.content).toHaveLength(2);
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("keeps the paragraph wrap when the inner paragraph carries htmlAttrs", () => {
    // autoUnwrap would lose the class otherwise.
    const original: ElementNode = ["blockquote", {}, ["p", { class: "lead" }, "Q"]];
    const pm = blockquoteSpec.fromComark(original, helpers)!;
    expect(blockquoteSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("seeds an empty paragraph for a childless blockquote (`>` alone is invalid PM otherwise)", () => {
    // `parse('>\n')` yields `['blockquote', {}]`; PM's `block+` schema rejects
    // an empty blockquote, so we must synthesize a placeholder child.
    const pm = blockquoteSpec.fromComark(["blockquote", {}] as ElementNode, helpers)!;
    expect(pm.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("blockquote with dual-context atoms (picture)", () => {
  const picHelpers = createSerializer({
    nodes: [blockquoteSpec, paragraphSpec, pictureSpec],
    marks: [],
  });
  const PIC: ElementNode = ["picture", {}, ["img", { src: "/a.png" }]];
  const PIC_PM: JSONContent = { type: "picture", attrs: { sources: [], img: { src: "/a.png" } } };

  it("emits a bare picture for a sole picture-only paragraph", () => {
    const pm: JSONContent = {
      type: "blockquote",
      content: [{ type: "paragraph", content: [PIC_PM] }],
    };
    const el = blockquoteSpec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["blockquote", {}, PIC]);
    const back = blockquoteSpec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual([{ type: "paragraph", content: [PIC_PM] }]);
  });

  it("hoists a picture-only paragraph sitting beside a text paragraph", () => {
    const pm: JSONContent = {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [PIC_PM] },
      ],
    };
    const el = blockquoteSpec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["blockquote", {}, ["p", {}, "A"], PIC]);
    const back = blockquoteSpec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual(pm.content);
  });
});
