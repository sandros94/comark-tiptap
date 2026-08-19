import { describe, expect, it } from "vitest";
import { boldSpec } from "../src/specs/marks";
import { paragraphSpec } from "../src/specs/paragraph";
import { pictureSpec } from "../src/specs/picture";
import { comarkSpecs } from "../src/specs";
import { comarkToPmDoc, createSerializer, pmDocToComark } from "../src/serializer";
import type { Node, MarkdownDocument, JSONContent, PMMark } from "../src/types";

const helpers = createSerializer({
  nodes: [paragraphSpec],
  marks: [boldSpec],
});

describe("createSerializer", () => {
  it("builds helpers that can round-trip a paragraph with a bold span", () => {
    const tree: MarkdownDocument = {
      nodes: [["p", {}, "a ", ["strong", { class: "k" }, "B"], " c"]],
      frontmatter: {},
      meta: {},
    };
    const pm = comarkToPmDoc(tree, helpers);
    expect(pm).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a " },
            {
              type: "text",
              text: "B",
              marks: [{ type: "bold", attrs: { htmlAttrs: { class: "k" } } }],
            },
            { type: "text", text: " c" },
          ],
        },
      ],
    });

    const back = pmDocToComark(pm, helpers);
    expect(back).toEqual(tree);
  });

  it("wraps stray block-level text in a paragraph (Comark autoUnwrap inverse)", () => {
    const tree: MarkdownDocument = {
      nodes: ["hello"],
      frontmatter: {},
      meta: {},
    };
    const pm = comarkToPmDoc(tree, helpers);
    expect(pm.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("wraps stray inline-only tags appearing at block level", () => {
    // A bold span at the root of an AST is unusual but valid — Comark
    // would emit it inside a paragraph normally. We wrap defensively
    // so PM stays schema-valid.
    const tree: MarkdownDocument = {
      nodes: [["strong", {}, "orphan"] as never],
      frontmatter: {},
      meta: {},
    };
    const pm = comarkToPmDoc(tree, helpers);
    expect(pm.content?.[0]?.type).toBe("paragraph");
    expect(pm.content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe("bold");
  });

  it("splats children of an unknown block tag instead of dropping the subtree", () => {
    // Forward-compat: a tag with no registered spec must not vanish silently —
    // its children are recovered (mirrors the inline fallback).
    const tree: MarkdownDocument = {
      nodes: [["section", {}, ["p", {}, "kept"]] as never],
      frontmatter: {},
      meta: {},
    };
    const pm = comarkToPmDoc(tree, helpers);
    expect(pm.content?.[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "kept" }],
    });
  });

  it("produces an empty-paragraph doc for an empty AST", () => {
    const pm = comarkToPmDoc({ nodes: [], frontmatter: {}, meta: {} }, helpers);
    expect(pm).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("throws on a non-doc PM root", () => {
    expect(() => pmDocToComark({ type: "paragraph" }, helpers)).toThrow(/Expected PM doc/);
  });

  it("preserves frontmatter / meta carry from the editor storage", () => {
    const result = pmDocToComark({ type: "doc", content: [] }, helpers, {
      frontmatter: { title: "T" },
      meta: { x: 1 },
    });
    expect(result.frontmatter).toEqual({ title: "T" });
    expect(result.meta).toEqual({ x: 1 });
  });
});

describe("serializeInlines — mark nesting (PM → Comark)", () => {
  const full = createSerializer(comarkSpecs);
  /* Serialize a paragraph's inline children straight through the full spec set;
     returns the Comark `p` element so nesting is visible. */
  const inlineToComark = (content: JSONContent[]): Node =>
    pmDocToComark({ type: "doc", content: [{ type: "paragraph", content }] }, full).nodes[0]!;
  const run = (text: string, marks: PMMark[]): JSONContent => ({ type: "text", text, marks });

  it("coalesces a single mark spanning mixed content into ONE element", () => {
    // bold over: "a ", em "b", " c" — must NOT fragment into three <strong>s
    // (which would lose the edge spaces on render).
    expect(
      inlineToComark([
        run("a ", [{ type: "bold" }]),
        run("b", [{ type: "bold" }, { type: "italic" }]),
        run(" c", [{ type: "bold" }]),
      ]),
    ).toEqual(["p", {}, ["strong", {}, "a ", ["em", {}, "b"], " c"]]);
  });

  it("forces the `code` mark innermost regardless of PM order (italic + code)", () => {
    // PM ranks `code` OUTSIDE italic, so it arrives as [code, italic]; emitting
    // it that way (`code` wrapping `em`) drops the italic on render.
    expect(inlineToComark([run("x", [{ type: "code" }, { type: "italic" }])])).toEqual([
      "p",
      {},
      ["em", {}, ["code", {}, "x"]],
    ]);
  });

  it("keeps `bold` outside `code` (bold is already innermost-safe)", () => {
    expect(inlineToComark([run("x", [{ type: "bold" }, { type: "code" }])])).toEqual([
      "p",
      {},
      ["strong", {}, ["code", {}, "x"]],
    ]);
  });

  it("does not split a link that wraps mixed content into several links", () => {
    const link: PMMark = { type: "link", attrs: { href: "/x", title: null } };
    expect(
      inlineToComark([run("a ", [link]), run("b", [link, { type: "bold" }]), run(" c", [link])]),
    ).toEqual(["p", {}, ["a", { href: "/x" }, "a ", ["strong", {}, "b"], " c"]]);
  });

  it("keeps adjacent same-mark runs SEPARATE when their htmlAttrs differ", () => {
    expect(
      inlineToComark([
        run("X", [{ type: "bold", attrs: { htmlAttrs: { class: "a" } } }]),
        run("Y", [{ type: "bold", attrs: { htmlAttrs: { class: "b" } } }]),
      ]),
    ).toEqual(["p", {}, ["strong", { class: "a" }, "X"], ["strong", { class: "b" }, "Y"]]);
  });
});

describe("paragraph sole-child hoist (dual-context atoms)", () => {
  const hoistHelpers = createSerializer({
    nodes: [paragraphSpec, pictureSpec],
    marks: [boldSpec],
  });
  const PIC_PM: JSONContent = {
    type: "picture",
    attrs: { sources: [], img: { src: "/a.png", alt: "A" } },
  };
  const PIC_EL: Node = ["picture", {}, ["img", { src: "/a.png", alt: "A" }]];

  it("hoists a bare picture out of an attrless paragraph", () => {
    const out = paragraphSpec.toComark({ type: "paragraph", content: [PIC_PM] }, hoistHelpers);
    expect(out).toEqual(PIC_EL);
  });

  it("keeps the paragraph when the sole picture carries a mark", () => {
    // A marked atom serializes to the mark's wrapper (strong/a/…) — never
    // valid at block position, so the hoist must not fire.
    const marked: JSONContent = { ...PIC_PM, marks: [{ type: "bold" }] };
    const out = paragraphSpec.toComark({ type: "paragraph", content: [marked] }, hoistHelpers);
    expect(out).toEqual(["p", {}, ["strong", {}, PIC_EL]]);
  });

  it("keeps the paragraph when it carries htmlAttrs", () => {
    const out = paragraphSpec.toComark(
      { type: "paragraph", attrs: { htmlAttrs: { class: "x" } }, content: [PIC_PM] },
      hoistHelpers,
    );
    expect(out).toEqual(["p", { class: "x" }, PIC_EL]);
  });
});
