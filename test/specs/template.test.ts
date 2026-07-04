import { describe, expect, it } from "vitest";
import { headingSpec } from "../../src/specs/heading";
import { paragraphSpec } from "../../src/specs/paragraph";
import { createSerializer } from "../../src/serializer";
import type { ComarkElement } from "../../src/types";
import { templateSpec } from "../../src/specs/template";

const helpers = createSerializer({
  nodes: [paragraphSpec, headingSpec, templateSpec],
  marks: [],
});

describe("templateSpec", () => {
  it("round-trips a header slot template", () => {
    const original: ComarkElement = ["template", { name: "header" }, ["h2", {}, "Title"]];
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
    const original: ComarkElement = ["template", { name: "content", class: "lead" }, "C"];
    const pm = templateSpec.fromComark(original, helpers)!;
    expect(pm.attrs).toEqual({ name: "content", htmlAttrs: { class: "lead" } });
    expect(templateSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("seeds an empty paragraph for an empty slot (PM `block+` cannot be empty)", () => {
    const pm = templateSpec.fromComark(["template", { name: "footer" }] as ComarkElement, helpers)!;
    expect(pm.content).toEqual([{ type: "paragraph" }]);
  });
});
