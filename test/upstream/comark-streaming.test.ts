/**
 * Upstream spike: pins how comark 0.6.2's FIRST-PARTY streaming parse behaves.
 * Tests comark alone (no editor, no `../src`) so a future comark bump that
 * changes streaming semantics fails here loudly, before the integration drifts.
 *
 * Covers: session/cache mechanics of a `createMarkdownParser` instance, the
 * `autoClose` rewrite of truncated tails, the `$` position marker, and a full
 * line-by-line typewriter run converging on the non-streaming parse.
 *
 * `// UPSTREAM:` marks a test whose observed behavior contradicts the documented
 * or expected one — the assertion pins what comark ACTUALLY does.
 */
import { createMarkdownParser, parseMarkdown } from "comark";
import type { MarkdownDocument, Node } from "comark";
import { describe, expect, it } from "vitest";

/** Multi-block document: heading, paragraph, code fence, list, table, container. */
const FIXTURE = [
  "# Title",
  "",
  "Intro paragraph with **bold** text.",
  "",
  "```ts",
  "const x = 1",
  "```",
  "",
  "- one",
  "- two",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "::alert",
  "Heads up **now**.",
  "::",
  "",
].join("\n");

const FIXTURE_LINES = FIXTURE.split("\n");

/** Cumulative prefix of `FIXTURE` ending after `lineCount` lines. */
const prefix = (lineCount: number): string => FIXTURE_LINES.slice(0, lineCount).join("\n");

/** The reference parse: fresh instance, no streaming, no cache. */
const canonical = (markdown: string): Promise<MarkdownDocument> =>
  parseMarkdown(markdown, { headingIds: false });

/**
 * Deep-clone with the streaming position marker removed. Only `$.line` is
 * dropped — `$` is overloaded and also carries the html plugin's `{html, block}`
 * flags, which exist in non-streaming parses too (pinned below).
 */
function stripPositions(tree: MarkdownDocument): MarkdownDocument {
  const clone = structuredClone(tree);
  const visit = (node: Node): void => {
    if (!Array.isArray(node)) return;
    const meta = node[1].$;
    if (meta) {
      delete meta.line;
      if (Object.keys(meta).length === 0) delete node[1].$;
    }
    for (const child of node.slice(2) as Node[]) visit(child);
  };
  for (const node of clone.nodes) visit(node);
  return clone;
}

/** Every `$` found in the tree, paired with its nesting depth (0 = top level). */
function collectMeta(nodes: Node[], depth = 0): { depth: number; meta: object }[] {
  const out: { depth: number; meta: object }[] = [];
  for (const node of nodes) {
    if (!Array.isArray(node)) continue;
    if (node[1].$) out.push({ depth, meta: node[1].$ });
    out.push(...collectMeta(node.slice(2) as Node[], depth + 1));
  }
  return out;
}

describe("comark streaming — session mechanics", () => {
  it("append-only ticks converge on the non-streaming parse", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    let tree!: MarkdownDocument;
    for (const lineCount of [3, 8, 12, 16, FIXTURE_LINES.length]) {
      tree = await parse(prefix(lineCount), { streaming: true });
    }
    expect(stripPositions(tree)).toEqual(await canonical(FIXTURE));
  });

  it("reuses every top-level node except the last positioned one, BY REFERENCE", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    const first = await parse(prefix(8), { streaming: true });
    const before = [...first.nodes];
    const second = await parse(prefix(12), { streaming: true });

    expect(before).toHaveLength(3); // h1, p, pre
    expect(second.nodes[0]).toBe(before[0]);
    expect(second.nodes[1]).toBe(before[1]);
    // The trailing node is always re-parsed with the new tail — new object.
    expect(second.nodes[2]).not.toBe(before[2]);
    expect(second.nodes[2]).toEqual(before[2]);
  });

  // UPSTREAM: the documented "no remaining markdown → return the previous tree"
  // shortcut is unreachable for non-empty input. `extractReusableNodes` always
  // re-parses from the SECOND-to-last positioned node, so the remaining slice is
  // never empty and a fresh tree object is built on every tick. Only the empty
  // string reaches the identity path.
  it("re-parses on a repeated identical tick instead of returning the same tree", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    const first = await parse(FIXTURE, { streaming: true });
    const second = await parse(FIXTURE, { streaming: true });

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    // The reused prefix is still shared by reference; only the tail is rebuilt.
    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes.at(-1)).not.toBe(first.nodes.at(-1));
  });

  it("returns the previous tree object for a repeated EMPTY tick", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    const first = await parse("", { streaming: true });
    expect(await parse("", { streaming: true })).toBe(first);
  });

  it("re-parses from scratch when the tick is a rewrite, not an append", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    await parse("# Title\n\nSome intro.\n", { streaming: true });

    const rewritten = "## Different\n\nTotally other body.\n";
    const tree = await parse(rewritten, { streaming: true });
    expect(stripPositions(tree)).toEqual(await canonical(rewritten));
  });

  it("resets the streaming cache on an interleaved non-streaming call", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    await parse(prefix(8), { streaming: true });

    const nonStreaming = await parse(FIXTURE);
    // No position markers without `streaming: true` (this fixture has no HTML,
    // whose `$` is unrelated — see the marker-shape block).
    expect(collectMeta(nonStreaming.nodes)).toEqual([]);
    expect(nonStreaming).toEqual(await canonical(FIXTURE));

    // Cache cleared: the next streaming tick rebuilds correctly from nothing.
    const resumed = await parse(FIXTURE, { streaming: true });
    expect(stripPositions(resumed)).toEqual(await canonical(FIXTURE));
  });

  it("honors `headingIds: false` in streaming mode", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    const tree = await parse("# Hello World\n", { streaming: true });
    expect(tree.nodes[0]).toEqual(["h1", { $: { line: 1 } }, "Hello World"]);

    // Control: the default parser DOES slug the heading, so the option is what suppresses it.
    const withIds = createMarkdownParser();
    const slugged = await withIds("# Hello World\n", { streaming: true });
    expect(slugged.nodes[0]).toEqual(["h1", { id: "hello-world", $: { line: 1 } }, "Hello World"]);
  });

  it("completes an UNCLOSED frontmatter block mid-stream", async () => {
    const parse = createMarkdownParser({ headingIds: false });

    // Tick 1: no closing `---` yet — autoClose synthesizes it, so the data lands early.
    const opening = await parse("---\ntitle: Draft", { streaming: true });
    expect(opening.frontmatter).toEqual({ title: "Draft" });
    expect(opening.nodes).toEqual([]);

    // Tick 2: real closer plus a body — frontmatter holds, body parses.
    const closed = await parse("---\ntitle: Draft\n---\n\nBody text.\n", { streaming: true });
    expect(closed.frontmatter).toEqual({ title: "Draft" });
    expect(closed.nodes).toEqual([["p", { $: { line: 5 } }, "Body text."]]);
  });
});

describe("comark streaming — `$` position marker shape", () => {
  it("marks ONLY top-level nodes, with a 1-based end line", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    const tree = await parse(FIXTURE, { streaming: true });

    for (const node of tree.nodes) {
      expect(Array.isArray(node) && typeof node[1].$?.line).toBe("number");
    }
    // Nested elements (li, th, td, strong, code) carry no marker at all.
    expect(collectMeta(tree.nodes).map((m) => m.depth)).toEqual(tree.nodes.map(() => 0));
    expect(tree.nodes.map((node) => (Array.isArray(node) ? node[1].$?.line : null))).toEqual([
      1, 3, 7, 10, 14, 18,
    ]);
  });

  // `$` is NOT streaming-only: the html plugin stores `{html, block}` there in
  // every mode, at any depth. A consumer must strip `$.line` specifically, never
  // the whole `$` bag.
  it("shares `$` with the html plugin's flags, in both modes and at any depth", async () => {
    const markdown = "# A\n\n<div>raw</div>\n\ntext <span>x</span> more\n";
    const nonStreaming = await canonical(markdown);
    expect(collectMeta(nonStreaming.nodes)).toEqual([
      { depth: 0, meta: { html: 1, block: 1 } },
      { depth: 1, meta: { html: 1, block: 0 } },
    ]);

    const parse = createMarkdownParser({ headingIds: false });
    const streamed = await parse(markdown, { streaming: true });
    // The top-level html block gets NO `line` — `preservePositions` skips
    // html_block tokens entirely, so it can never anchor an incremental reuse.
    expect(streamed.nodes[1]).toEqual(["div", { $: { html: 1, block: 1 } }, "raw"]);
    expect(stripPositions(streamed)).toEqual(nonStreaming);
  });
});

describe("comark streaming — autoClose on truncated tails", () => {
  /** One streaming tick on a fresh instance; positions stripped for shape asserts. */
  async function tick(markdown: string): Promise<Node[]> {
    const parse = createMarkdownParser({ headingIds: false });
    return stripPositions(await parse(markdown, { streaming: true })).nodes;
  }

  it("closes a partial `**` run into a strong", async () => {
    expect(await tick("text with **partial")).toEqual([
      ["p", {}, "text with ", ["strong", {}, "partial"]],
    ]);
  });

  it("closes an unclosed inline code span", async () => {
    expect(await tick("text with `code")).toEqual([["p", {}, "text with ", ["code", {}, "code"]]]);
  });

  it("yields a fenced code block for an unclosed fence", async () => {
    // Not an autoClose rewrite — CommonMark already ends a fence at EOF.
    expect(await tick("```ts\nconst x = 1")).toEqual([
      ["pre", { language: "ts" }, ["code", { class: "language-ts" }, "const x = 1"]],
    ]);
  });

  it("closes an unclosed `::` container", async () => {
    expect(await tick("::alert\nHello **world**")).toEqual([
      ["alert", {}, "Hello ", ["strong", {}, "world"]],
    ]);
  });

  it("yields a table for a partial final row", async () => {
    // The short row is padded with an empty cell rather than dropped.
    expect(await tick("| a | b |\n| --- | --- |\n| 1 |")).toEqual([
      [
        "table",
        {},
        ["thead", {}, ["tr", {}, ["th", {}, "a"], ["th", {}, "b"]]],
        ["tbody", {}, ["tr", {}, ["td", {}, "1"], ["td", {}]]],
      ],
    ]);
  });

  it("closes an unclosed link URL", async () => {
    expect(await tick("[link text](https://example.com")).toEqual([
      ["p", {}, ["a", { href: "https://example.com" }, "link text"]],
    ]);
  });

  it("leaves a space-surrounded `**` run literal (not left/right-flanking)", async () => {
    expect(await tick("a ** b")).toEqual([["p", {}, "a ** b"]]);
  });

  it("leaves INLINE markers untouched when input ends in a newline", async () => {
    // The inline-marker fix targets only the last line — empty after a trailing `\n`.
    expect(await tick("text with **partial\n")).toEqual([["p", {}, "text with **partial"]]);
  });

  it("still completes BLOCK constructs when input ends in a newline", async () => {
    // Block closers (containers, table padding) are not last-line-scoped.
    expect(await tick("::alert\nHello\n")).toEqual([["alert", {}, "Hello"]]);
    expect(await tick("| a | b |\n| --- | --- |\n| 1 |\n")).toEqual([
      [
        "table",
        {},
        ["thead", {}, ["tr", {}, ["th", {}, "a"], ["th", {}, "b"]]],
        ["tbody", {}, ["tr", {}, ["td", {}, "1"], ["td", {}]]],
      ],
    ]);
  });
});

describe("comark streaming — typewriter integration", () => {
  it("survives every line-by-line prefix and converges on the canonical parse", async () => {
    const parse = createMarkdownParser({ headingIds: false });
    let tree!: MarkdownDocument;
    for (let lineCount = 1; lineCount <= FIXTURE_LINES.length; lineCount++) {
      tree = await parse(prefix(lineCount), { streaming: true });
      expect(Array.isArray(tree.nodes)).toBe(true);
    }
    expect(stripPositions(tree)).toEqual(await canonical(FIXTURE));
  });
});
