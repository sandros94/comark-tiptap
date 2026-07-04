/**
 * @vitest-environment happy-dom
 *
 * Coverage for the string-as-markdown overrides ComarkSerializer
 * applies to Tiptap's core content commands. The premise: in a Comark
 * editor, strings are markdown — never HTML. These tests exercise every
 * entry point that plausibly hits the override (constructor seed,
 * runtime `setContent`, `insertContent`, `insertContentAt`) plus the
 * pass-through paths (object content, empty string) so we catch any
 * regression in either direction.
 *
 * The override is async (comark.parse is Promise-based), so each
 * markdown-string flow needs a microtask flush before assertions.
 */

import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComarkKit } from "../src/kit";

/** Wait for the editor's next `update` event. */
function nextUpdate(editor: Editor, timeoutMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (): void => {
      editor.off("update", handler);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      editor.off("update", handler);
      reject(new Error(`Editor 'update' did not fire within ${timeoutMs}ms`));
    }, timeoutMs);
    editor.on("update", handler);
  });
}

const flushMicrotasks = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeEditor(options: Partial<ConstructorParameters<typeof Editor>[0]> = {}): Editor {
  return new Editor({
    extensions: [ComarkKit],
    ...options,
  });
}

/**
 * `editor.getJSON()` returns Tiptap's typed schema view, where node-vs-text
 * is a discriminated union and `.text` only exists on text. Tests don't
 * benefit from that narrowing, so we cast to the looser `JSONContent`
 * shape (where `.text` is optional everywhere) once at access time.
 */
function getDoc(editor: Editor): JSONContent {
  return editor.getJSON() as JSONContent;
}

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});
function track(e: Editor): Editor {
  editors.push(e);
  return e;
}

describe("ComarkSerializer overrides — construction-time `content` seed", () => {
  it("parses a markdown string passed via `new Editor({ content })` instead of treating it as HTML", async () => {
    const editor = track(makeEditor({ content: "# Hello\n\nbody **strong**.\n" }));

    // Constructor returns synchronously with parse pending; the seed
    // lands when the next `update` event fires.
    await nextUpdate(editor);

    const json = editor.getJSON() as JSONContent;
    expect(json.type).toBe("doc");
    // The markdown produces a heading followed by a paragraph — if it
    // were HTML-parsed we'd see a single <p># Hello body strong.</p>.
    const blocks = json.content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[1]?.type).toBe("paragraph");
    const inlines = blocks[1]?.content ?? [];
    const boldRun = inlines.find((c) => c.marks?.some((m) => m.type === "bold"));
    expect(boldRun?.text).toBe("strong");
  });

  it("lets PM JSON content seed through unchanged (no markdown parser invoked)", () => {
    // Object input goes straight through baseSetContent — synchronous.
    const editor = track(
      makeEditor({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "pre-parsed" }],
            },
          ],
        } satisfies JSONContent,
      }),
    );

    expect(getDoc(editor).content?.[0]?.content?.[0]?.text).toBe("pre-parsed");
  });

  it("treats an empty-string seed as a clear, synchronously", () => {
    // `clearContent()` internally fires `setContent('')`. The override
    // MUST keep this sync or `clearContent()` becomes async — that
    // breaks every chain that relies on it.
    const editor = track(makeEditor({ content: "" }));

    const blocks = editor.getJSON().content ?? [];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("paragraph");
    expect(blocks[0]?.content ?? []).toHaveLength(0);
  });
});

describe("ComarkSerializer overrides — runtime `setContent`", () => {
  it("parses markdown when called with a string", async () => {
    const editor = track(makeEditor());

    editor.commands.setContent("## Section\n\n- a\n- b\n");
    await nextUpdate(editor);

    const blocks = editor.getJSON().content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(2);
    expect(blocks[1]?.type).toBe("bulletList");
    expect(blocks[1]?.content ?? []).toHaveLength(2);
  });

  it("round-trips the seed through `getMarkdown` storage helper", async () => {
    const editor = track(makeEditor());
    const seed = "# Title\n\nA paragraph with **bold** text.\n";

    editor.commands.setContent(seed);
    await nextUpdate(editor);

    const md = await editor.storage.comark.getMarkdown();
    // Renderers may reflow whitespace, so compare on a normalised form.
    expect(md.replace(/\s+$/g, "")).toBe(seed.replace(/\s+$/g, ""));
  });

  it("passes JSON content through synchronously without invoking the markdown parser", () => {
    const editor = track(makeEditor({ content: "seed text\n" }));
    const json: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "replaced" }],
        },
      ],
    };

    editor.commands.setContent(json);

    // No tick — replacement should be synchronous for object input.
    expect(getDoc(editor).content?.[0]?.content?.[0]?.text).toBe("replaced");
  });

  it("honors `emitUpdate: false` for markdown string seeds", async () => {
    const editor = track(makeEditor());
    const updates = vi.fn<() => void>();
    editor.on("update", updates);

    editor.commands.setContent("# Quiet\n", { emitUpdate: false });
    // No `update` event will fire — that's the contract under test —
    // so we can't `nextUpdate`. Drain the microtask queue instead so
    // the parse + sync follow-up land before assertions.
    await flushMicrotasks();

    expect(editor.getJSON().content?.[0]?.type).toBe("heading");
    expect(updates).not.toHaveBeenCalled();
  });
});

describe("ComarkSerializer overrides — `insertContent` / `insertContentAt`", () => {
  it("inserts markdown via `insertContent` as a parsed block", async () => {
    const editor = track(makeEditor({ content: "first\n" }));
    await nextUpdate(editor); // seed lands

    editor.commands.insertContent("\n## Inserted\n");
    await nextUpdate(editor); // insert lands

    const types = (editor.getJSON().content ?? []).map((b) => b.type);
    expect(types).toContain("heading");
  });

  it("inserts markdown via `insertContentAt(pos, md)` at a specific position", async () => {
    const editor = track(makeEditor({ content: "first paragraph\n" }));
    await nextUpdate(editor);

    const docSize = editor.state.doc.content.size;
    editor.commands.insertContentAt(docSize, "\n\n# Appended\n");
    await nextUpdate(editor);

    // StarterKit ships TrailingNode (an empty paragraph at the end of
    // the doc), so the heading isn't necessarily the very last block
    // — but it must be present and at level 1.
    const blocks = editor.getJSON().content ?? [];
    const heading = blocks.find((b) => b.type === "heading");
    expect(heading).toBeDefined();
    expect(heading?.attrs?.level).toBe(1);
  });

  it("passes JSON inserts through synchronously", () => {
    const editor = track(makeEditor({ content: "x\n" }));
    const docSize = editor.state.doc.content.size;

    editor.commands.insertContentAt(docSize, {
      type: "paragraph",
      content: [{ type: "text", text: "sync" }],
    });

    const lastBlock = (getDoc(editor).content ?? []).slice(-1)[0];
    expect(lastBlock?.content?.[0]?.text).toBe("sync");
  });
});

describe("ComarkSerializer overrides — `inline: true` insert option", () => {
  it("inserts a marked-up run inline at the cursor without wrapping in a new block", async () => {
    const editor = track(makeEditor({ content: "before \n" }));
    await nextUpdate(editor); // seed lands

    // Place the cursor at the end of the existing paragraph so the
    // inline payload lands inside it instead of starting a new block.
    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize - 1);

    editor.commands.insertContent("**bold**", { inline: true });
    await nextUpdate(editor);

    const blocks = getDoc(editor).content ?? [];
    // Still exactly one block — the inline insert didn't split off a
    // new paragraph.
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("paragraph");

    // The pre-existing run is intact and a bold-marked run now lives
    // alongside it.
    const inlines = blocks[0]?.content ?? [];
    const boldRun = inlines.find((c) => c.marks?.some((m) => m.type === "bold"));
    expect(boldRun?.text).toBe("bold");
  });

  it("inserts a plain string inline as a flat text run", async () => {
    const editor = track(makeEditor({ content: "a \n" }));
    await nextUpdate(editor);

    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize - 1);
    editor.commands.insertContent("plain", { inline: true });
    await nextUpdate(editor);

    const blocks = getDoc(editor).content ?? [];
    expect(blocks).toHaveLength(1);
    const text = (blocks[0]?.content ?? []).map((c) => c.text ?? "").join("");
    // The original 'a' (markdown trims the trailing space) plus our
    // inline 'plain' end up in the same paragraph as one flat run.
    expect(text).toBe("aplain");
  });

  it("bridges multi-paragraph markdown with hardBreak when used inline", async () => {
    const editor = track(makeEditor({ content: "seed\n" }));
    await nextUpdate(editor);

    const docSize = editor.state.doc.content.size;
    editor.commands.setTextSelection(docSize - 1);
    editor.commands.insertContent("first\n\nsecond", { inline: true });
    await nextUpdate(editor);

    const blocks = getDoc(editor).content ?? [];
    expect(blocks).toHaveLength(1);

    // The two source paragraphs collapsed into the same block; a
    // hardBreak sits between them so the boundary survives.
    const inlines = blocks[0]?.content ?? [];
    const hasHardBreak = inlines.some((c) => c.type === "hardBreak");
    expect(hasHardBreak).toBe(true);
    const flat = inlines.map((c) => c.text ?? "").join("");
    expect(flat).toContain("first");
    expect(flat).toContain("second");
  });

  it("omitting `inline` keeps the existing block-wrapping behavior (regression guard)", async () => {
    const editor = track(makeEditor({ content: "first\n" }));
    await nextUpdate(editor);

    editor.commands.insertContent("## new section");
    await nextUpdate(editor);

    const types = (getDoc(editor).content ?? []).map((b) => b.type);
    expect(types).toContain("heading");
  });

  it("honors `inline: true` on `insertContentAt` at an explicit position", async () => {
    const editor = track(makeEditor({ content: "open close\n" }));
    await nextUpdate(editor);

    // Insert between "open" and " close": position 5 is mid-paragraph.
    editor.commands.insertContentAt(5, " **mid**", { inline: true });
    await nextUpdate(editor);

    const blocks = getDoc(editor).content ?? [];
    expect(blocks).toHaveLength(1);
    const boldRun = (blocks[0]?.content ?? []).find((c) => c.marks?.some((m) => m.type === "bold"));
    expect(boldRun?.text).toBe("mid");
  });
});

describe('ComarkSerializer overrides — `contentType: "html"` escape hatch', () => {
  // The library default is markdown for strings; the HTML escape hatch
  // is for callers that genuinely have HTML (paste handlers, server-
  // rendered fragments, etc.) and want to opt back into Tiptap's stock
  // pipeline. The HTML path is fully synchronous — no comark.parse
  // microtask hop — so reads land immediately after the call.

  it('parses a string seed as HTML when `contentType: "html"` is set on the constructor', () => {
    const editor = track(
      makeEditor({
        content: "<h1>Hello</h1><p>body <strong>strong</strong>.</p>",
        contentType: "html",
      }),
    );

    // Synchronous — no `nextUpdate` / microtask flush needed.
    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[1]?.type).toBe("paragraph");
    const inlines = blocks[1]?.content ?? [];
    const boldRun = inlines.find((c) => c.marks?.some((m) => m.type === "bold"));
    expect(boldRun?.text).toBe("strong");
  });

  it("treats the same string as markdown (default) when `contentType` is omitted", async () => {
    // Regression guard: opting into the escape hatch is the ONLY thing
    // that changes behaviour. We pick a string with markdown-only
    // syntax (`# Heading`) — under the HTML path it would land as a
    // plain paragraph with literal `# Heading` text; under the
    // markdown path it lands as a real heading node.
    const editor = track(makeEditor({ content: "# Markdown heading\n" }));
    await nextUpdate(editor); // markdown parse is async

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    const headingText = (blocks[0]?.content ?? [])[0]?.text;
    expect(headingText).toBe("Markdown heading");
  });

  it('routes `setContent(html, { contentType: "html" })` through the stock pipeline synchronously', () => {
    const editor = track(makeEditor());

    editor.commands.setContent("<h2>Section</h2><ul><li>a</li><li>b</li></ul>", {
      contentType: "html",
    });

    // Synchronous — no `nextUpdate` needed.
    const blocks = editor.getJSON().content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(2);
    expect(blocks[1]?.type).toBe("bulletList");
    expect(blocks[1]?.content ?? []).toHaveLength(2);
  });

  it('routes `insertContent(html, { contentType: "html" })` through the stock pipeline', () => {
    const editor = track(makeEditor());

    editor.commands.setContent("<p>seed</p>", { contentType: "html" });
    editor.commands.insertContent("<h3>Inserted</h3>", { contentType: "html" });

    const types = (editor.getJSON().content ?? []).map((b) => b.type);
    expect(types).toContain("heading");
  });

  it('routes `insertContentAt(pos, html, { contentType: "html" })` through the stock pipeline', () => {
    const editor = track(makeEditor());
    editor.commands.setContent("<p>first</p>", { contentType: "html" });

    const docSize = editor.state.doc.content.size;
    editor.commands.insertContentAt(docSize, "<h3>Appended</h3>", { contentType: "html" });

    const blocks = editor.getJSON().content ?? [];
    const heading = blocks.find((b) => b.type === "heading");
    expect(heading).toBeDefined();
    expect(heading?.attrs?.level).toBe(3);
  });

  it('explicit `contentType: "markdown"` is the same as the default', async () => {
    // `'markdown'` exists for documentation / readability — there is
    // no behavioural difference vs. omitting `contentType`.
    const editor = track(makeEditor());

    editor.commands.setContent("## Section", { contentType: "markdown" });
    await nextUpdate(editor);

    expect(editor.getJSON().content?.[0]?.type).toBe("heading");
  });
});

describe('ComarkSerializer overrides — `contentType: "json"` (strict PM JSON)', () => {
  // String inputs with `contentType: 'json'` are passed straight to
  // Tiptap's stock pipeline as PM JSON. AST strings have an explicit
  // home on `setComarkAst(string)` — see the next describe block.

  it("routes a JSON-stringified PM doc through the stock pipeline (synchronous)", () => {
    const editor = track(makeEditor());
    const pm = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "PM JSON" }] },
      ],
    };

    editor.commands.setContent(JSON.stringify(pm), { contentType: "json" });

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(2);
    expect(blocks[0]?.content?.[0]?.text).toBe("PM JSON");
  });

  it('seeds a JSON-stringified PM doc via the constructor `content` + `contentType: "json"`', () => {
    const pm = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "PM seed" }] },
      ],
    };

    const editor = track(
      makeEditor({
        content: JSON.stringify(pm),
        contentType: "json",
      }),
    );

    // Synchronous — `'json'` flows through Tiptap's pipeline, no
    // microtask hop.
    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(4);
  });
});

describe("ComarkSerializer — `setComarkAst` accepts both objects and JSON-encoded strings", () => {
  // The explicit AST entry point. Mirrors `setComarkMarkdown(string)`:
  // give it whatever shape your input is in (object or JSON-encoded
  // string), and it lands as a Comark AST.

  it("applies a `ComarkTree` object", () => {
    const editor = track(makeEditor());
    editor.commands.setComarkAst({
      nodes: [["h1", {}, "object input"]],
      frontmatter: { title: "T" },
      meta: {},
    });

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[0]?.content?.[0]?.text).toBe("object input");
    expect(editor.storage.comark.frontmatter).toEqual({ title: "T" });
  });

  it("parses a JSON-encoded AST string and applies it (synchronous)", () => {
    const editor = track(makeEditor());
    const tree = {
      nodes: [["h1", {}, "AST string seed"]],
      frontmatter: { title: "T" },
      meta: {},
    };

    editor.commands.setComarkAst(JSON.stringify(tree));

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[0]?.content?.[0]?.text).toBe("AST string seed");
    expect(editor.storage.comark.frontmatter).toEqual({ title: "T" });
  });

  it("returns false when the string is malformed JSON", () => {
    // Both error paths emit a `console.warn` to help users debug a
    // misuse. Silence + assert here so the test output stays clean
    // AND the warning contract is locked in (regression catches a
    // future refactor that drops the warn).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = track(makeEditor());
    const result = editor.commands.setComarkAst("{not-json");
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("setComarkAst"), expect.anything());
    warn.mockRestore();
  });

  it("returns false when the string is valid JSON but not an AST shape", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = track(makeEditor());
    // Valid JSON, but no `nodes` array — should be rejected, not coerced.
    const result = editor.commands.setComarkAst(JSON.stringify({ type: "doc", content: [] }));
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("setComarkAst"), expect.anything());
    warn.mockRestore();
  });
});

describe("ComarkSerializer overrides — Comark AST objects auto-detected", () => {
  // Object auto-detection on bare `setContent` / `insertContent` /
  // `insertContentAt` — an ergonomic shorthand for "if it looks like an
  // AST, treat it like one." Strings always require explicit routing.

  it("auto-detects a Comark AST OBJECT passed to setContent (no contentType needed)", () => {
    const editor = track(makeEditor());
    const tree = {
      nodes: [["h3", {}, "auto-detected"]],
      frontmatter: {},
      meta: {},
    };

    editor.commands.setContent(tree as unknown as Parameters<typeof editor.commands.setContent>[0]);

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(3);
  });

  it("auto-detects a Comark AST OBJECT passed to insertContent", () => {
    const editor = track(makeEditor());
    const tree = {
      nodes: [["h2", {}, "inserted via AST object"]],
      frontmatter: {},
      meta: {},
    };

    editor.commands.insertContent(
      tree as unknown as Parameters<typeof editor.commands.insertContent>[0],
    );

    const heading = (getDoc(editor).content ?? []).find((b) => b.type === "heading");
    expect(heading).toBeDefined();
    expect(heading?.attrs?.level).toBe(2);
  });

  it("auto-detects a Comark AST OBJECT passed to insertContentAt", () => {
    const editor = track(makeEditor());
    editor.commands.setContent("seed", { contentType: "html" });
    const docSize = editor.state.doc.content.size;

    const tree = {
      nodes: [["h2", {}, "appended via AST object"]],
      frontmatter: {},
      meta: {},
    };

    editor.commands.insertContentAt(
      docSize,
      tree as unknown as Parameters<typeof editor.commands.insertContentAt>[1],
    );

    const heading = (getDoc(editor).content ?? []).find((b) => b.type === "heading");
    expect(heading).toBeDefined();
    expect(heading?.attrs?.level).toBe(2);
  });

  it("seeds a Comark AST OBJECT via the constructor `content`", async () => {
    const tree = {
      nodes: [["h2", {}, "AST object constructor seed"]],
      frontmatter: { title: "from-tree" },
      meta: {},
    };

    const editor = track(
      makeEditor({
        content: tree as unknown as JSONContent,
      }),
    );

    // `setComarkAst` is queued via microtask in onBeforeCreate to keep
    // the construction sequencing predictable; flush before reading.
    await flushMicrotasks();

    const blocks = getDoc(editor).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(2);
    expect(editor.storage.comark.frontmatter).toEqual({ title: "from-tree" });
  });
});

describe("ComarkSerializer — onError hook", () => {
  it("routes swallowed failures to onError (with phase) instead of console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const phases: string[] = [];
    const editor = track(
      new Editor({
        extensions: [
          ComarkKit.configure({
            serializer: {
              onError: (_err, ctx) => phases.push(ctx.phase),
            },
          }),
        ],
      }),
    );

    editor.commands.setComarkAst("{not json"); // JSON parse failure
    editor.commands.setComarkAst(JSON.stringify({ type: "doc" })); // valid JSON, wrong shape
    editor.commands.setContent("{bad", { contentType: "json" }); // JSON parse failure

    expect(phases).toEqual(["setComarkAst", "setComarkAst", "setContent"]);
    // onError replaces the default warn.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to console.warn when no onError is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = track(makeEditor());
    editor.commands.setComarkAst("{not json");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
