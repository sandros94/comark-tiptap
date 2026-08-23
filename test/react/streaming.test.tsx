/**
 * @vitest-environment happy-dom
 *
 * Coverage for the React binding's `streaming` prop — the sugar that routes
 * controlled `value` updates into a stream session instead of the normal
 * apply path.
 *
 * The session batches applies on `requestAnimationFrame`, so this file stubs
 * rAF with the manual queue from `test/streaming.test.ts` — `settle()` releases
 * one frame inside `act`, then drains the parse → apply chain.
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import type { ContentValue, JSONContent } from "comark-tiptap";
import { ComarkEditor } from "../../src/react/index";

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
  await act(async () => {
    runFrame();
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
  cleanup();
  vi.unstubAllGlobals();
  frames.clear();
});

interface Host {
  editor: () => Editor;
  setValue: (v: ContentValue) => void;
  setStreaming: (on: boolean) => void;
  changes: () => ContentValue[];
}

/** Render `<ComarkEditor value streaming onChange>` with both sides controllable. */
async function renderHost(
  initial: ContentValue,
  streamingAtMount: boolean,
  contentType: "markdown" | "json" = "markdown",
): Promise<Host> {
  let editor: Editor | null = null;
  let setValue: (v: ContentValue) => void = () => {};
  let setStreaming: (on: boolean) => void = () => {};
  const changes: ContentValue[] = [];

  function HostComponent(): React.ReactNode {
    const [value, setV] = useState<ContentValue>(initial);
    const [streaming, setS] = useState(streamingAtMount);
    setValue = setV;
    setStreaming = setS;
    return (
      <ComarkEditor
        value={value}
        streaming={streaming}
        contentType={contentType}
        onChange={(v) => changes.push(v)}
        onReady={(e) => {
          editor = e;
        }}
      />
    );
  }
  render(<HostComponent />);
  await waitFor(() => expect(editor).not.toBeNull());
  await settle();
  return {
    editor: () => editor as unknown as Editor,
    setValue: (v) => act(() => setValue(v)),
    setStreaming: (on) => act(() => setStreaming(on)),
    changes: () => changes,
  };
}

// #region tests

describe("<ComarkEditor> (React) — streaming", () => {
  it("routes value updates into a session and holds the editor read-only", async () => {
    const host = await renderHost("", true);
    const ed = host.editor();

    expect(ed.isEditable).toBe(false);

    host.setValue("# Streamed\n\nbody text.\n");
    await settle();

    expect(ed.state.doc.child(0).type.name).toBe("heading");
    expect(ed.getText()).toContain("Streamed");
    expect(ed.isEditable).toBe(false);
    // Streamed applies are model-apply stamped: the caller owns the markdown.
    expect(host.changes()).toHaveLength(0);
  });

  it("flipping streaming off applies the canonical correction and restores editability", async () => {
    const host = await renderHost("", true);
    const ed = host.editor();

    host.setValue("text with **partial");
    await settle();
    // Streaming optimistically closes the dangling `**`.
    expect(hasMark(ed.getJSON() as JSONContent, "bold")).toBe(true);

    host.setStreaming(false);
    await settle();

    expect(hasMark(ed.getJSON() as JSONContent, "bold")).toBe(false);
    expect(ed.getText()).toBe("text with **partial");
    expect(ed.isEditable).toBe(true);
    expect(host.changes()).toHaveLength(0);
  });

  it("resumes the normal apply path after the session ends", async () => {
    const host = await renderHost("", true);
    const ed = host.editor();

    host.setStreaming(false);
    await settle();

    host.setValue("## After\n");
    await settle();

    expect(ed.state.doc.child(0).attrs.level).toBe(2);
    expect(ed.getText()).toContain("After");
  });

  it("streaming already true at mount keeps the seed and stays read-only", async () => {
    const host = await renderHost("# Seed\n", true);
    const ed = host.editor();

    /* The seed reaches the doc twice over: through the constructor AND as the
       session's first snapshot (the value effect routes it). Both land the
       same content, so the doc is just the seed. */
    expect(ed.getText()).toContain("Seed");
    expect(ed.isEditable).toBe(false);

    host.setValue("# Seed\n\nstreamed on top.\n");
    await settle();
    expect(ed.getText()).toContain("streamed on top");
  });

  it("ignores a non-string value while streaming", async () => {
    const docA: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "AAA" }] }],
    };
    const docB: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "BBB" }] }],
    };
    const host = await renderHost(docA, true, "json");
    const ed = host.editor();
    const before = ed.getJSON();

    host.setValue(docB);
    await settle();

    expect(ed.getJSON()).toEqual(before);
    expect(ed.getText()).toContain("AAA");
  });
});
