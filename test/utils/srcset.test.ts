import { describe, expect, it } from "vitest";
import { parseSrcset, resolveSrcset } from "../../src/utils/srcset";

describe("parseSrcset", () => {
  it("parses single URL without descriptor", () => {
    expect(parseSrcset("a.png")).toEqual([{ url: "a.png", descriptor: "" }]);
  });

  it("parses candidates with x and w descriptors", () => {
    expect(parseSrcset("a.png 1x, b.png 2x, c.png 640w")).toEqual([
      { url: "a.png", descriptor: "1x" },
      { url: "b.png", descriptor: "2x" },
      { url: "c.png", descriptor: "640w" },
    ]);
  });

  it("handles trailing commas and irregular whitespace", () => {
    expect(parseSrcset("  a.png, b.png  2x ,\n c.png ")).toEqual([
      { url: "a.png", descriptor: "" },
      { url: "b.png", descriptor: "2x" },
      { url: "c.png", descriptor: "" },
    ]);
  });

  it("keeps a whitespace-free comma inside the URL (browser behavior)", () => {
    expect(parseSrcset("a.png,b.png 2x")).toEqual([{ url: "a.png,b.png", descriptor: "2x" }]);
  });

  it("returns empty for empty/whitespace input", () => {
    expect(parseSrcset("")).toEqual([]);
    expect(parseSrcset("  , ,")).toEqual([]);
  });
});

describe("resolveSrcset", () => {
  const cdn = (url: string): string | undefined =>
    url.startsWith("public/") ? `https://cdn.example/${url}` : undefined;

  it("resolves each candidate URL, preserving descriptors", () => {
    expect(resolveSrcset("public/a.webp 1x, public/b.webp 2x", cdn)).toBe(
      "https://cdn.example/public/a.webp 1x, https://cdn.example/public/b.webp 2x",
    );
  });

  it("leaves URLs the resolver declines untouched", () => {
    expect(resolveSrcset("public/a.webp 1x, https://other.host/b.webp 2x", cdn)).toBe(
      "https://cdn.example/public/a.webp 1x, https://other.host/b.webp 2x",
    );
  });

  it("returns unparseable input verbatim", () => {
    expect(resolveSrcset("   ", cdn)).toBe("   ");
  });
});
