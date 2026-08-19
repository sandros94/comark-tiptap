import { describe, expect, it } from "vitest";
import { headingSpec } from "../../src/specs/heading";
import { paragraphSpec } from "../../src/specs/paragraph";
import { pictureSpec } from "../../src/specs/picture";
import { createSerializer } from "../../src/serializer";
import type { ElementNode, JSONContent } from "../../src/types";
import { templateSpec } from "../../src/specs/template";

const helpers = createSerializer({
  nodes: [paragraphSpec, headingSpec, templateSpec],
  marks: [],
});

describe("templateSpec", () => {
  it("round-trips a header slot template", () => {
    const original: ElementNode = ["template", { name: "header" }, ["h2", {}, "Title"]];
    const pm = templateSpec.fromComark(original, helpers)!;
    expect(pm).toEqual({
      type: "comarkTemplate",
      attrs: { name: "header" },
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });
    expect(templateSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("preserves htmlAttrs on the template", () => {
    /* Single-line slot: Comark's canonical form unwraps the lone paragraph, so
       the round-trip target is the inline text `'C'`, not `['p', {}, 'C']`. */
    const original: ElementNode = ["template", { name: "content", class: "lead" }, "C"];
    const pm = templateSpec.fromComark(original, helpers)!;
    expect(pm.attrs).toEqual({ name: "content", htmlAttrs: { class: "lead" } });
    expect(templateSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("seeds an empty paragraph for an empty slot (PM `block+` cannot be empty)", () => {
    const pm = templateSpec.fromComark(["template", { name: "footer" }] as ElementNode, helpers)!;
    expect(pm.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("template with dual-context atoms (picture)", () => {
  const picHelpers = createSerializer({
    nodes: [paragraphSpec, headingSpec, templateSpec, pictureSpec],
    marks: [],
  });
  const PIC: ElementNode = ["picture", {}, ["img", { src: "/a.png" }]];
  const PIC_PM: JSONContent = { type: "picture", attrs: { sources: [], img: { src: "/a.png" } } };

  it("emits a bare picture for a sole picture-only paragraph", () => {
    const pm: JSONContent = {
      type: "comarkTemplate",
      attrs: { name: "media" },
      content: [{ type: "paragraph", content: [PIC_PM] }],
    };
    const el = templateSpec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["template", { name: "media" }, PIC]);
    const back = templateSpec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual([{ type: "paragraph", content: [PIC_PM] }]);
  });

  it("hoists a picture-only paragraph sitting beside a text paragraph", () => {
    const pm: JSONContent = {
      type: "comarkTemplate",
      attrs: { name: "media" },
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [PIC_PM] },
      ],
    };
    const el = templateSpec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["template", { name: "media" }, ["p", {}, "A"], PIC]);
    const back = templateSpec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual(pm.content);
  });
});
