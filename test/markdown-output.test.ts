/**
 * @vitest-environment happy-dom
 *
 * Coverage for the markdown OUTPUT path: markdown → editor → `getMarkdown()`
 * (= `renderMarkdown(getAst())`). This is the primary way content leaves the
 * editor as markdown, yet it's the surface upstream drift is most likely to
 * break silently — a comark `renderMarkdown` change, or a serializer regression
 * in mark nesting, would corrupt output here with no other test failing.
 *
 * Cases are chosen to pin the mark-nesting fixes (code innermost, coalescing of
 * a shared outer mark) and the per-node renderers (tables w/ alignment, lists
 * w/ start, code fences, components) against both regressions and upstream
 * changes. Whitespace-normalized compare — comark reflows/pads and drops the
 * trailing newline.
 */
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { ComarkKit, defineComarkComponent } from "../src/index";

function nextUpdate(editor: Editor, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (): void => {
      editor.off("update", handler);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      editor.off("update", handler);
      reject(new Error(`no update within ${timeoutMs}ms`));
    }, timeoutMs);
    editor.on("update", handler);
  });
}

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

/** Seed markdown, wait for the async parse to land, read markdown back. */
async function roundTrip(markdown: string, extensions = [ComarkKit]): Promise<string> {
  const editor = new Editor({ extensions, content: markdown });
  editors.push(editor);
  await nextUpdate(editor);
  return editor.storage.comark.getMarkdown();
}

const norm = (s: string): string => s.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "");

describe("markdown output — inline mark nesting (regression pins)", () => {
  it.each<[string, string, string]>([
    ["a mark spanning mixed content coalesces", "**bold _italic_ end**\n", "**bold *italic* end**"],
    ["italic wrapping inline code keeps the italic", "*`x`*\n", "*`x`*"],
    ["bold wrapping inline code", "**`x`**\n", "**`x`**"],
    ["bold+italic wrapping inline code", "***`x`***\n", "***`x`***"],
    ["a link wrapping mixed content stays ONE link", "[a **b** c](/x)\n", "[a **b** c](/x)"],
    ["a plain link gains no target/rel", "[x](/y)\n", "[x](/y)"],
    [
      "an explicit link attribute survives",
      '[x](/y){target="_blank"}\n',
      '[x](/y){target="_blank"}',
    ],
    ["adjacent separate marks stay readable", "a **b** **c** d\n", "a **b** **c** d"],
  ])("%s", async (_label, input, expected) => {
    expect(norm(await roundTrip(input))).toBe(expected);
  });
});

describe("markdown output — block nodes (upstream-drift pins)", () => {
  it("renders a table with per-column alignment", async () => {
    const out = norm(await roundTrip("| L | C | R |\n| :- | :-: | -: |\n| a | b | c |\n"));
    expect(out).toContain("| :-- | :-: | --: |");
  });

  it("renders an ordered list preserving a non-1 start", async () => {
    const out = norm(await roundTrip("3. three\n4. four\n"));
    expect(out).toBe("3. three\n4. four");
  });

  it("renders a nested bullet list", async () => {
    const out = norm(await roundTrip("- a\n  - b\n  - c\n"));
    expect(out).toBe("- a\n  - b\n  - c");
  });

  it("renders a fenced code block with its language", async () => {
    const out = norm(await roundTrip("```ts\nconst x = 1\n```\n"));
    expect(out).toBe("```ts\nconst x = 1\n```");
  });

  it("renders a heading and paragraph", async () => {
    const out = norm(await roundTrip("# Title\n\nBody text.\n"));
    expect(out).toBe("# Title\n\nBody text.");
  });

  it("renders a block component with declared props", async () => {
    const Alert = defineComarkComponent({
      name: "alert",
      kind: "block",
      props: { type: { type: "string", default: "info" } },
    });
    const out = norm(
      await roundTrip('::alert{type="warning"}\nHeads up **now**.\n::\n', [
        ComarkKit.configure({ components: [Alert] }),
      ]),
    );
    expect(out).toContain("::alert");
    expect(out).toContain('type="warning"');
    expect(out).toContain("Heads up **now**.");
  });
});
