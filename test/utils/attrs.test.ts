import { describe, expect, it } from "vitest";
import { attrsEqual, cleanAttrs, mergeAttrs, splitAttrs } from "../../src/utils/attrs";

describe("cleanAttrs", () => {
  it("returns an empty object for undefined input", () => {
    expect(cleanAttrs(undefined)).toEqual({});
  });

  it("strips Comark `$` source-position metadata", () => {
    expect(cleanAttrs({ class: "a", $: { line: 3 } })).toEqual({ class: "a" });
  });

  it("drops null and undefined values", () => {
    expect(
      cleanAttrs({
        a: "x",
        b: null as unknown as string,
        c: undefined as unknown as string,
      }),
    ).toEqual({ a: "x" });
  });

  it("keeps falsy-but-meaningful values", () => {
    expect(cleanAttrs({ count: 0, flag: false, empty: "" })).toEqual({
      count: 0,
      flag: false,
      empty: "",
    });
  });
});

describe("splitAttrs", () => {
  it("routes declared semantic keys to `semantic` and the rest to `htmlAttrs`", () => {
    const result = splitAttrs({ "level": 1, "id": "top", "class": "big", "data-x": "y" }, [
      "level",
    ]);
    expect(result).toEqual({
      semantic: { level: 1 },
      htmlAttrs: { "id": "top", "class": "big", "data-x": "y" },
    });
  });

  it("drops `$` and nullish entries from both buckets", () => {
    const result = splitAttrs(
      {
        level: 2,
        id: undefined as unknown as string,
        class: null as unknown as string,
        $: { line: 9 },
      },
      ["level"],
    );
    expect(result).toEqual({ semantic: { level: 2 }, htmlAttrs: {} });
  });

  it("handles undefined input", () => {
    expect(splitAttrs(undefined, ["level"])).toEqual({
      semantic: {},
      htmlAttrs: {},
    });
  });
});

describe("mergeAttrs", () => {
  it("returns a single attrs object containing both semantic and html attrs", () => {
    expect(mergeAttrs({ level: 3 }, { "class": "a", "data-x": "1" })).toEqual({
      "level": 3,
      "class": "a",
      "data-x": "1",
    });
  });

  it("lets semantic keys win on collision", () => {
    expect(mergeAttrs({ class: "semantic" }, { class: "html" })).toEqual({
      class: "semantic",
    });
  });

  it("drops nullish entries", () => {
    expect(
      mergeAttrs(
        { level: 1, id: undefined as unknown as string },
        { "class": null as unknown as string, "data-x": "1" },
      ),
    ).toEqual({ "level": 1, "data-x": "1" });
  });
});

describe("attrsEqual", () => {
  it("compares Record-shaped attrs by content", () => {
    expect(attrsEqual({ class: "a" }, { class: "a" })).toBe(true);
    expect(attrsEqual({ class: "a" }, { class: "b" })).toBe(false);
  });

  it("treats undefined values as absent", () => {
    expect(attrsEqual({ class: "a", id: undefined }, { class: "a" })).toBe(true);
    expect(attrsEqual(undefined, undefined)).toBe(true);
    expect(attrsEqual(undefined, {})).toBe(true);
  });

  it("rejects on missing keys", () => {
    expect(attrsEqual({ class: "a" }, { class: "a", id: "b" })).toBe(false);
  });
});
