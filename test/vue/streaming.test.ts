/**
 * @vitest-environment happy-dom
 *
 * Coverage for the Vue bindings' `streaming` flag — the sugar that routes
 * reactive bound content into a stream session instead of the normal apply
 * path: `useComarkEditor({ streaming })` and `<ComarkEditor :streaming>`.
 *
 * The session batches applies on `requestAnimationFrame`, so this file stubs
 * rAF with the manual queue from `test/streaming.test.ts` — `settle()` flushes
 * Vue's scheduler, releases one frame, then drains the parse → apply chain.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  shallowRef,
  type ShallowRef,
  type VNode,
} from "vue";
import type { ContentValue, MarkdownDocument } from "comark-tiptap";
import {
  useComarkEditor,
  type UseComarkEditorOptions,
  type UseComarkEditorReturn,
} from "../../src/vue/use-comark-editor";
import { ComarkEditor } from "../../src/vue/index";

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

/** Flush Vue's scheduler, run the pending frame, drain the parse → apply chain. */
async function settle(): Promise<void> {
  await nextTick();
  runFrame();
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Whether any inline run in the doc carries the given mark. */
function hasMark(json: JSONContent, type: string): boolean {
  if (json.marks?.some((m) => m.type === type)) return true;
  return (json.content ?? []).some((c) => hasMark(c, type));
}

interface Mounted {
  app: { unmount(): void };
  container: HTMLElement;
}

const live: Mounted[] = [];
function track(m: Mounted): Mounted {
  live.push(m);
  return m;
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
  while (live.length) {
    const m = live.pop()!;
    m.app.unmount();
    m.container.remove();
  }
  vi.unstubAllGlobals();
  frames.clear();
});

/** Mount a component calling `useComarkEditor(options)`; returns an editor getter. */
function mountComposable(options: UseComarkEditorOptions): () => Editor | undefined {
  let captured: UseComarkEditorReturn | null = null;
  const Comp = defineComponent({
    setup() {
      captured = useComarkEditor(options);
      return () => h("div");
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(Comp);
  app.mount(container);
  track({ app, container });
  const result = captured as UseComarkEditorReturn | null;
  if (!result) throw new Error("useComarkEditor never ran (component setup not invoked)");
  return () => result.editor.value;
}

/* `h()` against `<ComarkEditor>`'s full prop type trips TS2589 (excessively
   deep instantiation) in this test's dynamic-props shape; a loose signature
   sidesteps overload resolution without changing runtime behavior. */
const hLoose = h as (type: unknown, props: unknown, children?: unknown) => VNode;

interface MountedComponent {
  model: ShallowRef<ContentValue | undefined>;
  streaming: ShallowRef<boolean>;
  editor: () => Editor | undefined;
  /** `update:modelValue` emissions — outside-in writes to `model` don't count. */
  modelEmits: () => number;
}

/** Mount `<ComarkEditor v-model :streaming>` with both sides controllable. */
function mountComponent(initial: ContentValue, streamingAtMount: boolean): MountedComponent {
  const model = shallowRef<ContentValue | undefined>(initial);
  const streaming = shallowRef(streamingAtMount);
  const editorRef = shallowRef<Editor | undefined>(undefined);
  let modelEmitCount = 0;

  const Host = defineComponent({
    setup() {
      return () =>
        hLoose(ComarkEditor, {
          "modelValue": model.value,
          "modelModifiers": { markdown: true },
          "streaming": streaming.value,
          "onUpdate:modelValue": (v: ContentValue) => {
            modelEmitCount++;
            model.value = v;
          },
          "onReady": (e: Editor) => {
            editorRef.value = e;
          },
        });
    },
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = createApp(Host);
  app.mount(container);
  track({ app, container });
  return {
    model,
    streaming,
    editor: () => editorRef.value,
    modelEmits: () => modelEmitCount,
  };
}

// #region composable

describe("useComarkEditor — streaming", () => {
  it("routes reactive string content into a session and holds the editor read-only", async () => {
    const md = ref("");
    const m = mountComposable({ content: md, streaming: true });
    await settle();
    const editor = m()!;

    expect(editor.isEditable).toBe(false);

    md.value = "# Streamed\n\nbody text.\n";
    await settle();

    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.getText()).toContain("Streamed");
    expect(editor.isEditable).toBe(false);
  });

  it("flipping streaming off applies the canonical correction and restores editability", async () => {
    const md = ref("");
    const streaming = ref(true);
    const m = mountComposable({ content: md, streaming });
    await settle();
    const editor = m()!;

    md.value = "text with **partial";
    await settle();
    // Streaming optimistically closes the dangling `**`.
    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(true);

    streaming.value = false;
    await settle();

    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(false);
    expect(editor.getText()).toBe("text with **partial");
    expect(editor.isEditable).toBe(true);
  });

  it("resumes the normal apply path after the session ends", async () => {
    const md = ref("");
    const streaming = ref(true);
    const m = mountComposable({ content: md, streaming });
    await settle();
    const editor = m()!;

    streaming.value = false;
    await settle();

    md.value = "## After\n";
    await settle();

    expect(editor.state.doc.child(0).attrs.level).toBe(2);
    expect(editor.getText()).toContain("After");
  });

  it("streaming already true at mount keeps the seed and stays read-only", async () => {
    const md = ref("# Seed\n");
    const m = mountComposable({ content: md, streaming: true });
    await settle();
    const editor = m()!;

    // The seed still flows through the constructor; the session only owns
    // what `set()` is fed, so nothing is lost or double-applied.
    expect(editor.getText()).toContain("Seed");
    expect(editor.isEditable).toBe(false);

    md.value = "# Seed\n\nstreamed on top.\n";
    await settle();
    expect(editor.getText()).toContain("streamed on top");
  });

  it("ignores a non-string bound value while streaming", async () => {
    const content = shallowRef<ContentValue | undefined>("");
    const m = mountComposable({ content, streaming: true });
    await settle();
    const editor = m()!;

    content.value = "# Base\n";
    await settle();
    const before = editor.getJSON();

    const tree: MarkdownDocument = { nodes: [["h6", {}, "ast"]], frontmatter: {}, meta: {} };
    content.value = tree;
    await settle();

    expect(editor.getJSON()).toEqual(before);
    expect(editor.getText()).toContain("Base");
  });
});

// #region component

describe("<ComarkEditor> (Vue) — streaming", () => {
  it("routes v-model updates into the session without echoing back to the model", async () => {
    const m = mountComponent("", true);
    await settle();
    const editor = m.editor()!;

    expect(editor.isEditable).toBe(false);

    m.model.value = "# Streamed\n\nbody text.\n";
    await settle();

    expect(editor.getText()).toContain("Streamed");
    // Streamed applies are model-apply stamped: the model owns the markdown.
    expect(m.modelEmits()).toBe(0);
  });

  it("flipping the prop off corrects the doc and hands editability back", async () => {
    const m = mountComponent("", true);
    await settle();
    const editor = m.editor()!;

    m.model.value = "text with **partial";
    await settle();
    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(true);

    m.streaming.value = false;
    await settle();

    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(false);
    expect(editor.getText()).toBe("text with **partial");
    expect(editor.isEditable).toBe(true);
    expect(m.modelEmits()).toBe(0);
  });

  it("runs the README recipe end-to-end: flip on, for-await accumulate, flip off", async () => {
    const m = mountComponent("", false);
    await settle();

    // AI-SDK-shaped source. NOTE: no settle between the flip and the loop —
    // the recipe relies on Vue flushing the streaming watcher (session opens)
    // before the first `for await` iteration can write to the model.
    async function* aiStream(): AsyncGenerator<string> {
      yield "# Tit";
      yield "le\n\n```ts\nconst x";
      yield " = 1\n```\n\ntext with **wip";
    }

    let accumulated = "";
    m.streaming.value = true;
    for await (const chunk of aiStream()) {
      accumulated += chunk;
      m.model.value = accumulated;
      await settle(); // each chunk crosses a task boundary, like a real stream
    }

    // Mid-stream: the session owns the doc — read-only, optimistic bold.
    const editor = m.editor()!;
    expect(editor.isEditable).toBe(false);
    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(true);

    m.streaming.value = false;
    await settle();

    // Finalized: canonical parse (bold gone), editable, model untouched…
    expect(editor.isEditable).toBe(true);
    expect(hasMark(editor.getJSON() as JSONContent, "bold")).toBe(false);
    expect(m.model.value).toBe("# Title\n\n```ts\nconst x = 1\n```\n\ntext with **wip");
    expect(m.modelEmits()).toBe(0);
    // …and no chunk ever slipped through the normal (undoable) apply path.
    expect(editor.can().undo()).toBe(false);
  });

  it("mounts with streaming already on without crashing", async () => {
    const m = mountComponent("# Seed\n", true);
    await settle();
    const editor = m.editor()!;

    expect(editor.getText()).toContain("Seed");
    expect(editor.isEditable).toBe(false);
  });
});
