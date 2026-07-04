import { describe, expect, it } from "vitest";
import { boldSpec } from "../../src/specs/marks";
import { paragraphSpec } from "../../src/specs/paragraph";
import { createSerializer } from "../../src/serializer";
import { autoUnwrapBlocks } from "../../src/utils/auto-unwrap";

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [boldSpec] });

describe("autoUnwrapBlocks", () => {
  it("unwraps a single attrless paragraph to its inlines", () => {
    const result = autoUnwrapBlocks(
      [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A " },
            {
              type: "text",
              text: "B",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
      helpers,
    );
    expect(result).toEqual(["A ", ["strong", {}, "B"]]);
  });

  it("keeps the paragraph wrap when it carries htmlAttrs", () => {
    const result = autoUnwrapBlocks(
      [
        {
          type: "paragraph",
          attrs: { htmlAttrs: { class: "lead" } },
          content: [{ type: "text", text: "X" }],
        },
      ],
      helpers,
    );
    expect(result).toEqual([["p", { class: "lead" }, "X"]]);
  });

  it("keeps multi-block content fully wrapped", () => {
    const result = autoUnwrapBlocks(
      [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [{ type: "text", text: "B" }] },
      ],
      helpers,
    );
    expect(result).toEqual([
      ["p", {}, "A"],
      ["p", {}, "B"],
    ]);
  });

  it("returns an empty array for empty content", () => {
    expect(autoUnwrapBlocks([], helpers)).toEqual([]);
    expect(autoUnwrapBlocks(undefined, helpers)).toEqual([]);
  });
});
