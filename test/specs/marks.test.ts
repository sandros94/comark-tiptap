import { describe, expect, it } from "vitest";
import { createSerializer } from "../../src/serializer";
import type { ComarkElement } from "../../src/types";
import { boldSpec, codeSpec, italicSpec, linkSpec, strikeSpec } from "../../src/specs/marks";
import { paragraphSpec } from "../../src/specs/paragraph";

const helpers = createSerializer({
  nodes: [paragraphSpec],
  marks: [boldSpec, italicSpec, strikeSpec, codeSpec, linkSpec],
});

// #region bold

describe("boldSpec.toComark", () => {
  it("wraps a child in `<strong>`", () => {
    expect(boldSpec.toComark({ type: "bold" }, "hi")).toEqual(["strong", {}, "hi"]);
  });

  it("emits htmlAttrs as flat attributes", () => {
    const result = boldSpec.toComark(
      { type: "bold", attrs: { htmlAttrs: { class: "hi", id: "b1" } } },
      "X",
    );
    expect(result).toEqual(["strong", { class: "hi", id: "b1" }, "X"]);
  });

  it("canonicalizes <b> tags to <strong> on the way out", () => {
    expect(boldSpec.toComark({ type: "bold" }, "x")[0]).toBe("strong");
  });
});

describe("boldSpec.fromComark", () => {
  it("produces a bare bold mark for an attrless `<strong>`", () => {
    expect(boldSpec.fromComark(["strong", {}, "x"] as ComarkElement)).toEqual({ type: "bold" });
  });

  it("routes element attributes onto `mark.attrs.htmlAttrs`", () => {
    const mark = boldSpec.fromComark(["strong", { class: "k", id: "b" }, "x"] as ComarkElement);
    expect(mark).toEqual({
      type: "bold",
      attrs: { htmlAttrs: { class: "k", id: "b" } },
    });
  });

  it("accepts the legacy `<b>` tag", () => {
    expect(boldSpec.fromComark(["b", { class: "a" }, "x"] as ComarkElement)).toEqual({
      type: "bold",
      attrs: { htmlAttrs: { class: "a" } },
    });
  });
});

describe("bold round-trip via helpers", () => {
  it('parses Comark `["strong", {.foo}, "X"]` to PM and back', () => {
    const original: ComarkElement = ["p", {}, ["strong", { class: "foo" }, "X"]];
    const pm = paragraphSpec.fromComark(original, helpers);
    const back = paragraphSpec.toComark(pm!, helpers);
    expect(back).toEqual(original);
  });

  it("preserves nested marks layered through helpers.parseInlines", () => {
    const original: ComarkElement = ["p", {}, "a ", ["strong", { class: "k" }, "B"], " c"];
    const pm = paragraphSpec.fromComark(original, helpers);
    const back = paragraphSpec.toComark(pm!, helpers);
    expect(back).toEqual(original);
  });
});

// #region italic

describe("italicSpec", () => {
  it("renders as `<em>` with htmlAttrs flat", () => {
    expect(italicSpec.toComark({ type: "italic" }, "x")).toEqual(["em", {}, "x"]);
    expect(
      italicSpec.toComark({ type: "italic", attrs: { htmlAttrs: { class: "q" } } }, "X"),
    ).toEqual(["em", { class: "q" }, "X"]);
  });

  it("reads `<em>` and the legacy `<i>` into the italic mark", () => {
    expect(italicSpec.fromComark(["em", { class: "k" }, "x"] as ComarkElement)).toEqual({
      type: "italic",
      attrs: { htmlAttrs: { class: "k" } },
    });
    expect(italicSpec.fromComark(["i", {}, "y"] as ComarkElement)).toEqual({ type: "italic" });
  });
});

// #region strike

describe("strikeSpec", () => {
  it("renders as `<del>` with htmlAttrs flat", () => {
    expect(strikeSpec.toComark({ type: "strike" }, "x")).toEqual(["del", {}, "x"]);
    expect(
      strikeSpec.toComark({ type: "strike", attrs: { htmlAttrs: { class: "k" } } }, "X"),
    ).toEqual(["del", { class: "k" }, "X"]);
  });

  it("accepts the input shapes Comark might emit (del / s / strike)", () => {
    expect(strikeSpec.fromComark(["del", { class: "a" }, "x"] as ComarkElement)).toEqual({
      type: "strike",
      attrs: { htmlAttrs: { class: "a" } },
    });
    expect(strikeSpec.fromComark(["s", {}, "y"] as ComarkElement)).toEqual({ type: "strike" });
    expect(strikeSpec.fromComark(["strike", {}, "z"] as ComarkElement)).toEqual({ type: "strike" });
  });
});

// #region code

describe("codeSpec", () => {
  it("renders as `<code>` with htmlAttrs flat", () => {
    expect(codeSpec.toComark({ type: "code" }, "x")).toEqual(["code", {}, "x"]);
    expect(codeSpec.toComark({ type: "code", attrs: { htmlAttrs: { class: "k" } } }, "X")).toEqual([
      "code",
      { class: "k" },
      "X",
    ]);
  });

  it("reads `<code>` into a code mark", () => {
    expect(codeSpec.fromComark(["code", {}, "x"] as ComarkElement)).toEqual({ type: "code" });
    expect(codeSpec.fromComark(["code", { class: "k" }, "x"] as ComarkElement)).toEqual({
      type: "code",
      attrs: { htmlAttrs: { class: "k" } },
    });
  });
});

// #region link

describe("linkSpec.toComark", () => {
  it("emits href / title as semantic attrs and routes htmlAttrs through", () => {
    const result = linkSpec.toComark(
      {
        type: "link",
        attrs: {
          href: "https://x.io",
          title: "T",
          htmlAttrs: { "data-x": "y" },
        },
      },
      "go",
    );
    expect(result).toEqual(["a", { "href": "https://x.io", "title": "T", "data-x": "y" }, "go"]);
  });

  it("emits href even when null/empty (for AST stability)", () => {
    expect(linkSpec.toComark({ type: "link" }, "x")).toEqual(["a", { href: "" }, "x"]);
  });

  it("round-trips target/rel/class as native PM attrs (not htmlAttrs)", () => {
    const result = linkSpec.toComark(
      {
        type: "link",
        attrs: {
          href: "https://x.io",
          target: "_blank",
          rel: "noopener",
          class: "btn",
        },
      },
      "go",
    );
    expect(result).toEqual([
      "a",
      { href: "https://x.io", target: "_blank", rel: "noopener", class: "btn" },
      "go",
    ]);
  });
});

describe("linkSpec.fromComark", () => {
  it("reads href / title into native attrs", () => {
    expect(linkSpec.fromComark(["a", { href: "/x", title: "t" }, "go"] as ComarkElement)).toEqual({
      type: "link",
      attrs: { href: "/x", title: "t" },
    });
  });

  it("reads target / rel / class into native attrs (not htmlAttrs)", () => {
    expect(
      linkSpec.fromComark([
        "a",
        { "href": "/x", "target": "_blank", "rel": "noopener", "class": "btn", "data-x": "y" },
        "go",
      ] as ComarkElement),
    ).toEqual({
      type: "link",
      attrs: {
        href: "/x",
        title: null,
        target: "_blank",
        rel: "noopener",
        class: "btn",
        htmlAttrs: { "data-x": "y" },
      },
    });
  });

  it("omits htmlAttrs when there is nothing left after reserved keys", () => {
    const mark = linkSpec.fromComark(["a", { href: "/x" }, "X"] as ComarkElement);
    expect(mark).toEqual({ type: "link", attrs: { href: "/x", title: null } });
  });
});
