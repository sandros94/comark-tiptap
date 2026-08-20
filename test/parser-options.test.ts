/**
 * @vitest-environment happy-dom
 *
 * `ComarkSerializerOptions.parserOptions` — the consumer-tunable comark parse
 * subset, forwarded by `ComarkKit.configure({ serializer: { parserOptions } })`.
 * Pins the pass-through in both directions (default on, opted off) and the
 * owned invariants: `autoClose` / `headingIds` stay forced off even when
 * smuggled past the types with a cast.
 */

import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { ComarkKit } from "../src/kit";
import type { ComarkParserOptions } from "../src/serializer";

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

function makeEditor(parserOptions?: ComarkParserOptions): Editor {
  return new Editor({
    extensions: [ComarkKit.configure(parserOptions ? { serializer: { parserOptions } } : {})],
  });
}

const editors: Editor[] = [];
const track = (e: Editor): Editor => {
  editors.push(e);
  return e;
};
afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

function hasMark(editor: Editor, markName: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.marks.some((m) => m.type.name === markName)) found = true;
  });
  return found;
}

describe("serializer `parserOptions` pass-through", () => {
  it("defaults: bare URLs linkify", async () => {
    const editor = track(makeEditor());
    const applied = nextUpdate(editor);
    editor.commands.setComarkMarkdown("see https://example.com today");
    await applied;

    expect(hasMark(editor, "link")).toBe(true);
  });

  it("`linkify: false` reaches the parser through the kit", async () => {
    const editor = track(makeEditor({ linkify: false }));
    const applied = nextUpdate(editor);
    editor.commands.setComarkMarkdown("see https://example.com today");
    await applied;

    expect(hasMark(editor, "link")).toBe(false);
  });

  it("owned invariants beat options smuggled past the types", async () => {
    // A JS consumer (or a determined cast) could hand the withheld keys in;
    // `resolveParseOptions` must still layer the invariants on top.
    const editor = track(makeEditor({ headingIds: true, autoClose: true } as ComarkParserOptions));
    const applied = nextUpdate(editor);
    editor.commands.setComarkMarkdown("# Hello World\n\ntext with **partial");
    await applied;

    // headingIds stays off: no auto-generated id on the heading.
    const heading = editor.getJSON().content?.[0];
    expect(heading?.type).toBe("heading");
    expect(heading?.attrs?.htmlAttrs?.id).toBeUndefined();

    // autoClose stays off: the dangling `**` stays literal, no bold mark.
    expect(hasMark(editor, "bold")).toBe(false);
  });
});
