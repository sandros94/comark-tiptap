import { describe, expect, it } from "vitest";
import { paragraphSpec } from "../../src/specs/paragraph";
import { pictureSpec } from "../../src/specs/picture";
import { createSerializer } from "../../src/serializer";
import type { ElementNode } from "../../src/types";
import { tableCellSpec, tableHeaderSpec, tableRowSpec, tableSpec } from "../../src/specs/table";

const helpers = createSerializer({
  nodes: [paragraphSpec, tableSpec, tableRowSpec, tableHeaderSpec, tableCellSpec],
  marks: [],
});

describe("table round-trip", () => {
  it("round-trips a basic GFM table with header + body", () => {
    const original: ElementNode = [
      "table",
      {},
      ["thead", {}, ["tr", {}, ["th", {}, "A"], ["th", {}, "B"]]],
      ["tbody", {}, ["tr", {}, ["td", {}, "1"], ["td", {}, "2"]]],
    ];
    const pm = tableSpec.fromComark(original, helpers)!;
    expect(pm).toMatchObject({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph" }] },
            { type: "tableHeader", content: [{ type: "paragraph" }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph" }] },
            { type: "tableCell", content: [{ type: "paragraph" }] },
          ],
        },
      ],
    });
    expect(tableSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("reads comark's `style:text-align` into the native cell align attr and back", () => {
    // Comark expresses alignment as `style:"text-align:X"` (its renderer ignores
    // a bare `align` attr), so that's the canonical round-trip shape.
    const original: ElementNode = [
      "table",
      {},
      [
        "tbody",
        {},
        [
          "tr",
          {},
          ["td", { style: "text-align:right" }, "X"],
          ["td", { style: "text-align:center" }, "Y"],
        ],
      ],
    ];
    const pm = tableSpec.fromComark(original, helpers)!;
    expect(pm.content?.[0]?.content?.[0]?.attrs).toEqual({ align: "right" });
    expect(pm.content?.[0]?.content?.[1]?.attrs).toEqual({ align: "center" });
    expect(tableSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("reads a hand-authored native `align` attr and canonicalizes it to `style:text-align`", () => {
    const pm = tableSpec.fromComark(
      ["table", {}, ["tbody", {}, ["tr", {}, ["td", { align: "right" }, "X"]]]] as ElementNode,
      helpers,
    )!;
    expect(pm.content?.[0]?.content?.[0]?.attrs).toEqual({ align: "right" });
    expect(tableSpec.toComark(pm, helpers)).toEqual([
      "table",
      {},
      ["tbody", {}, ["tr", {}, ["td", { style: "text-align:right" }, "X"]]],
    ]);
  });

  it("keeps non-alignment cell styles in htmlAttrs alongside the bridged align", () => {
    const pm = tableSpec.fromComark(
      [
        "table",
        {},
        ["tbody", {}, ["tr", {}, ["td", { style: "text-align:center; color:red" }, "X"]]],
      ] as ElementNode,
      helpers,
    )!;
    expect(pm.content?.[0]?.content?.[0]?.attrs).toEqual({
      align: "center",
      htmlAttrs: { style: "color:red" },
    });
  });

  it("preserves colspan/rowspan as semantic attrs", () => {
    const original: ElementNode = [
      "table",
      {},
      ["tbody", {}, ["tr", {}, ["td", { colspan: 2 }, "merged"], ["td", { rowspan: 3 }, "tall"]]],
    ];
    const pm = tableSpec.fromComark(original, helpers)!;
    const cells = pm.content?.[0]?.content ?? [];
    expect(cells[0]?.attrs).toEqual({ colspan: 2 });
    expect(cells[1]?.attrs).toEqual({ rowspan: 3 });
    expect(tableSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("drops `colspan: 1` / `rowspan: 1` (the implicit defaults)", () => {
    const pm = tableSpec.fromComark(
      [
        "table",
        {},
        ["tbody", {}, ["tr", {}, ["td", { colspan: 1, rowspan: 1 }, "x"]]],
      ] as ElementNode,
      helpers,
    )!;
    expect(pm.content?.[0]?.content?.[0]?.attrs).toBeUndefined();
  });

  it("preserves htmlAttrs on the table itself", () => {
    const original: ElementNode = [
      "table",
      { "class": "striped", "data-sortable": "true" },
      ["tbody", {}, ["tr", {}, ["td", {}, "x"]]],
    ];
    const pm = tableSpec.fromComark(original, helpers)!;
    expect(pm.attrs).toEqual({
      htmlAttrs: { "class": "striped", "data-sortable": "true" },
    });
    expect(tableSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("regroups rows into thead/tbody on the way back out", () => {
    // The PM shape has rows flat; the spec must reconstruct thead/tbody.
    const pm = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableHeader", content: [{ type: "paragraph" }] }],
        },
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
        },
      ],
    };
    const out = tableSpec.toComark(pm, helpers) as ElementNode;
    expect(out[2]?.[0]).toBe("thead");
    expect(out[3]?.[0]).toBe("tbody");
  });

  it("keeps row order when a header row is not first (no silent reordering)", () => {
    // Rows body/header/body: the middle header must NOT jump to <thead>. Only a
    // leading run of header rows becomes <thead>; here there is none, so every
    // row stays in <tbody> in source order (the header cell stays a th).
    const row = (tag: "tableCell" | "tableHeader") => ({
      type: "tableRow",
      content: [{ type: tag, content: [{ type: "paragraph" }] }],
    });
    const pm = { type: "table", content: [row("tableCell"), row("tableHeader"), row("tableCell")] };
    expect(tableSpec.toComark(pm, helpers)).toEqual([
      "table",
      {},
      ["tbody", {}, ["tr", {}, ["td", {}]], ["tr", {}, ["th", {}]], ["tr", {}, ["td", {}]]],
    ]);
  });

  it("seeds a minimal cell for a rowless table (invalid PM otherwise)", () => {
    const pm = tableSpec.fromComark(["table", {}] as ElementNode, helpers)!;
    expect(pm.content).toEqual([
      { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] },
    ]);
  });

  it("coerces a stringy colwidth into a number array", () => {
    const pm = tableSpec.fromComark(
      [
        "table",
        {},
        ["tbody", {}, ["tr", {}, ["td", { colwidth: ["80", "120"] }, "x"]]],
      ] as ElementNode,
      helpers,
    )!;
    expect(pm.content?.[0]?.content?.[0]?.attrs?.colwidth).toEqual([80, 120]);
  });
});

describe("cells with dual-context atoms (picture)", () => {
  const picHelpers = createSerializer({
    nodes: [paragraphSpec, tableSpec, tableRowSpec, tableHeaderSpec, tableCellSpec, pictureSpec],
    marks: [],
  });
  const PIC_A = ["picture", {}, ["img", { src: "/a.png" }]] as ElementNode;
  const PIC_B = ["picture", {}, ["img", { src: "/b.png" }]] as ElementNode;

  it("round-trips a cell holding two picture-only paragraphs", () => {
    // Each paragraph hoists to a bare picture on the way out; on the way
    // back each bare picture must regain its OWN paragraph, not merge.
    const cell = {
      type: "tableCell",
      content: [
        {
          type: "paragraph",
          content: [{ type: "picture", attrs: { sources: [], img: { src: "/a.png" } } }],
        },
        {
          type: "paragraph",
          content: [{ type: "picture", attrs: { sources: [], img: { src: "/b.png" } } }],
        },
      ],
    };
    const el = tableCellSpec.toComark(cell, picHelpers) as ElementNode;
    expect(el).toEqual(["td", {}, PIC_A, PIC_B]);
    const back = tableCellSpec.fromComark(el, picHelpers)!;
    expect(back.content).toHaveLength(2);
    expect(back.content?.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("keeps a picture inside a cell's text run in ONE paragraph", () => {
    const el = ["td", {}, "see ", PIC_A] as ElementNode;
    const back = tableCellSpec.fromComark(el, picHelpers)!;
    expect(back.content).toHaveLength(1);
    expect(back.content?.[0]?.type).toBe("paragraph");
    expect(back.content?.[0]?.content).toHaveLength(2);
  });
});
