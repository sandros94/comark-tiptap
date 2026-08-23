/**
 * @vitest-environment happy-dom
 *
 * Coverage for the stream session (`editor.storage.comark.stream()`): the
 * imperative primitive that progressively renders model-produced markdown.
 *
 * The session batches applies on `requestAnimationFrame`, so every test stubs
 * rAF with a manual queue — `runFrame()` releases exactly one batch and
 * `settle()` also drains the parser's promise chain.
 */

import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_APPLY_META } from "../src/content";
import { ComarkKit } from "../src/kit";

/** Multi-block document ending in a paragraph (so TrailingNode adds nothing). */
const FIXTURE = [
  "# Title",
  "",
  "Intro with **bold** text.",
  "",
  "- one",
  "- two",
  "",
  "Closing line.",
  "",
].join("\n");

// #region harness

type FrameCallback = () => void;

const frames = new Map<number, FrameCallback>();
let lastHandle = 0;

/** Release every frame queued so far (callbacks may queue new ones). */
function runFrame(): void {
  const due = [...frames.values()];
  frames.clear();
  for (const cb of due) cb();
}

/** Run the pending frame, then drain the parse → apply promise chain. */
async function settle(): Promise<void> {
  runFrame();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

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

function makeEditor(options: Partial<ConstructorParameters<typeof Editor>[0]> = {}): Editor {
  return new Editor({ extensions: [ComarkKit], ...options });
}

const editors: Editor[] = [];
function track(e: Editor): Editor {
  editors.push(e);
  return e;
}

/** Every doc-changing transaction the editor emits, newest last. */
function recordUpdates(
  editor: Editor,
): { transaction: unknown; getMeta: (k: string) => unknown }[] {
  const seen: { transaction: unknown; getMeta: (k: string) => unknown }[] = [];
  editor.on("update", ({ transaction }) => {
    seen.push({ transaction, getMeta: (k) => transaction.getMeta(k) });
  });
  return seen;
}

/** Whether any inline run in the doc carries the given mark. */
function hasMark(json: JSONContent, type: string): boolean {
  if (json.marks?.some((m) => m.type === type)) return true;
  return (json.content ?? []).some((c) => hasMark(c, type));
}

beforeEach(() => {
  frames.clear();
  lastHandle = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCallback) => {
    lastHandle += 1;
    frames.set(lastHandle, cb);
    return lastHandle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
});

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  vi.unstubAllGlobals();
  frames.clear();
});

// #region tests

describe("stream session — lifecycle", () => {
  it("takes the editor read-only without emitting an update, and restores it on end()", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);

    expect(editor.isEditable).toBe(true);
    const session = editor.storage.comark.stream();

    expect(editor.isEditable).toBe(false);
    expect(session.active).toBe(true);
    expect(updates).toHaveLength(0);

    await session.end();

    expect(editor.isEditable).toBe(true);
    expect(session.active).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("restores the PRE-stream editability, not a hardcoded `true`", async () => {
    const editor = track(makeEditor({ editable: false }));
    expect(editor.isEditable).toBe(false);

    const session = editor.storage.comark.stream();
    expect(editor.isEditable).toBe(false);

    await session.end();
    expect(editor.isEditable).toBe(false);
  });
});

describe("stream session — applying snapshots", () => {
  it("applies a snapshot to the doc after one frame", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("# Title\n\nBody text.\n");
    await settle();

    const blocks = (editor.getJSON() as JSONContent).content ?? [];
    expect(blocks[0]?.type).toBe("heading");
    expect(blocks[0]?.attrs?.level).toBe(1);
    expect(blocks[1]?.type).toBe("paragraph");
    expect(blocks[1]?.content?.[0]?.text).toBe("Body text.");

    await session.end();
  });

  it("coalesces a burst of set() calls into ONE transaction per frame", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    session.set("# A\n");
    session.set("# A\n\nB\n");
    session.set("# A\n\nB\n\nC\n");
    await settle();

    expect(updates).toHaveLength(1);
    // Only the last snapshot of the window is parsed.
    expect(editor.getText()).toContain("C");

    await session.end();
  });

  it("skips a repeated identical snapshot (comark would re-parse the tail)", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    session.set(FIXTURE);
    await settle();
    expect(updates).toHaveLength(1);

    session.set(FIXTURE);
    await settle();
    expect(updates).toHaveLength(1);

    await session.end();
  });

  it("keeps the unchanged block prefix by reference when the tail grows", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("# Title\n\nFirst paragraph.\n");
    await settle();
    const before = editor.state.doc.child(0);
    expect(before.type.name).toBe("heading");

    session.set("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n");
    await settle();

    expect(editor.state.doc.child(0)).toBe(before);
    expect(editor.state.doc.childCount).toBe(3);

    await session.end();
  });

  it("adopts the snapshot's frontmatter onto storage", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("---\ntitle: Draft\n---\n\nBody text.\n");
    await settle();

    expect(editor.storage.comark.frontmatter).toEqual({ title: "Draft" });

    await session.end();
  });

  it("never leaks comark's `$` position markers into the doc", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set(FIXTURE);
    await settle();

    expect(JSON.stringify(editor.getJSON())).not.toContain('"$"');
    const markdown = await editor.storage.comark.getMarkdown();
    expect(markdown.replace(/\s+$/g, "")).toBe(FIXTURE.replace(/\s+$/g, ""));

    await session.end();
  });

  it("falls back to a microtask when requestAnimationFrame is unavailable", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("# Microtask\n");
    await flushMicrotasks();

    expect(editor.getText()).toContain("Microtask");

    await session.end();
  });
});

describe("stream session — transaction shape", () => {
  it("stamps the model-apply meta and stays out of the history", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    session.set("# Tagged\n");
    await settle();

    expect(updates).toHaveLength(1);
    expect(updates[0]?.getMeta(MODEL_APPLY_META)).toBe(true);
    expect(updates[0]?.getMeta("addToHistory")).toBe(false);

    await session.end();
  });

  it("leaves the undo stack untouched, so undo() cannot drop streamed content", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("# Streamed\n\nbody text.\n");
    await settle();
    await session.end();

    const after = editor.getJSON();
    expect(editor.can().undo()).toBe(false);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(after);
    expect(editor.getText()).toContain("Streamed");
  });
});

describe("stream session — finalize", () => {
  it("corrects an autoClose artifact on end()", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("text with **partial");
    await settle();
    // Streaming optimistically closes the dangling `**`.
    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(true);

    await session.end();

    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(false);
    expect(editor.getText()).toBe("text with **partial");
    expect(editor.isEditable).toBe(true);

    // …and matches what a plain canonical parse of the same string produces.
    const reference = track(makeEditor());
    reference.commands.setComarkMarkdown("text with **partial");
    await nextUpdate(reference);
    expect(editor.getJSON()).toEqual(reference.getJSON());
  });

  it("dispatches nothing extra when the stream already ended cleanly", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    session.set(FIXTURE);
    await settle();
    expect(updates).toHaveLength(1);

    await session.end();
    expect(updates).toHaveLength(1);
  });

  it("just restores editability when no snapshot was ever fed", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    await session.end();

    expect(updates).toHaveLength(0);
    expect(editor.isEditable).toBe(true);
    expect(session.active).toBe(false);
  });
});

describe("stream session — cancellation", () => {
  it("abort() before the frame runs applies nothing and makes set() inert", async () => {
    const editor = track(makeEditor());
    const updates = recordUpdates(editor);
    const session = editor.storage.comark.stream();

    session.set("# Never applied\n");
    session.abort();
    await settle();

    expect(updates).toHaveLength(0);
    expect(editor.getText()).not.toContain("Never applied");
    expect(editor.isEditable).toBe(true);
    expect(session.active).toBe(false);

    session.set("# Still never applied\n");
    await settle();
    expect(updates).toHaveLength(0);
  });

  it("a second stream() supersedes the first session", async () => {
    const editor = track(makeEditor());
    const first = editor.storage.comark.stream();
    const second = editor.storage.comark.stream();

    expect(first.active).toBe(false);
    expect(second.active).toBe(true);
    // The supersede must not hand editability back mid-stream.
    expect(editor.isEditable).toBe(false);

    first.set("# from first\n");
    await settle();
    expect(editor.getText()).not.toContain("from first");

    second.set("# from second\n");
    await settle();
    expect(editor.getText()).toContain("from second");

    await second.end();
    expect(editor.isEditable).toBe(true);
  });

  it("keeps the editor read-only when a new stream starts during a pending end()", async () => {
    const editor = track(makeEditor());
    const first = editor.storage.comark.stream();
    first.set("# One\n");
    await settle();

    const ending = first.end(); // canonical re-parse in flight
    const second = editor.storage.comark.stream();
    await ending;
    await settle();

    // The superseded session's late restore must not flip editability…
    expect(editor.isEditable).toBe(false);
    expect(second.active).toBe(true);

    await second.end();
    // …and the successor hands back the pre-chain baseline.
    expect(editor.isEditable).toBe(true);
  });

  it("survives an editor destroy before the frame runs", async () => {
    const editor = makeEditor();
    const session = editor.storage.comark.stream();

    session.set("# Too late\n");
    editor.destroy();

    await expect(settle()).resolves.toBeUndefined();
    expect(session.active).toBe(false);

    session.set("# Also too late\n");
    await expect(settle()).resolves.toBeUndefined();
  });

  it("survives an editor destroy while a parse is in flight", async () => {
    const editor = makeEditor();
    const session = editor.storage.comark.stream();

    session.set("# Mid-parse\n");
    runFrame(); // parse in flight
    editor.destroy();

    await expect(settle()).resolves.toBeUndefined();
    expect(session.active).toBe(false);
  });

  it("drops a stale in-flight parse when a newer snapshot lands", async () => {
    const editor = track(makeEditor());
    const session = editor.storage.comark.stream();

    session.set("# alpha\n");
    runFrame();
    // The parse is async, so nothing landed yet — `alpha` is in flight.
    expect(editor.getText()).not.toContain("alpha");
    session.set("# beta\n");
    runFrame(); // supersedes it
    await settle();

    expect(editor.getText()).not.toContain("alpha");
    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.state.doc.child(0).textContent).toBe("beta");

    await session.end();
  });
});
