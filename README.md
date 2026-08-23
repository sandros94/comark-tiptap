# comark-tiptap

A [Comark](https://github.com/comarkdown/comark)-aware [Tiptap](https://tiptap.dev) kit. Built on `@tiptap/starter-kit` + tables + image, it adds a thin layer that round-trips **losslessly** between Tiptap's ProseMirror schema, the Comark AST, and markdown — plus optional framework bindings and [progressive streaming](#streaming) of model-produced markdown.

- **`comark-tiptap`** — the framework-agnostic core (`ComarkKit`, serializer, specs).
- **`comark-tiptap/vue`** — Vue 3 bindings (`<ComarkEditor>`, `useComarkEditor`, Vue NodeView helpers).
- **`comark-tiptap/react`** — React bindings (`<ComarkEditor>`, `useComarkEditor`, React NodeView helpers).
- **`comark-tiptap/internal`** — plumbing the bindings share. **Not public API** — it can change in any release.

More framework bindings are planned, following the frameworks Comark already supports. Each ships as its own subpath export with its framework as an **optional** peer dependency — so the core stays framework-agnostic and you install only what you use.

> Discussion: [`comarkdown/comark#164`](https://github.com/comarkdown/comark/issues/164).

## Install

```bash
# core
pnpm add comark-tiptap comark @tiptap/core @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-code-block @tiptap/extension-image @tiptap/extension-table

# + Vue bindings
pnpm add vue @tiptap/vue-3

# + React bindings
pnpm add react react-dom @tiptap/react
```

## Core — `comark-tiptap`

`ComarkKit` is a single `Extension.create` that registers StarterKit + tables + image + picture + the comark-specific nodes (`ComarkComment`, `ComarkTemplate`), the global `htmlAttrs` declaration, and the serializer. The schema is whatever Tiptap upstream ships — no per-extension reimplementations — so it stays drop-in compatible with the rest of the Tiptap ecosystem.

```ts
import { Editor } from "@tiptap/core";
import { ComarkKit, defineComarkComponent } from "comark-tiptap";

const Alert = defineComarkComponent({
  name: "alert",
  kind: "block",
  props: {
    type: { type: "string", default: "info" },
    title: { type: "string" },
  },
});

const editor = new Editor({
  extensions: [ComarkKit.configure({ components: [Alert] })],
  content: "# Hello\n\n::alert\nHi\n::", // markdown — parsed async, see below
});

editor.storage.comark.getAst(); // MarkdownDocument (sync; memoized snapshot — read-only)
await editor.storage.comark.getMarkdown(); // string (async — comark/render)
editor.storage.comark.stream(); // progressive-markdown session — see "Streaming"
editor.commands.setComarkMarkdown("# Hi"); // markdown → parseMarkdown
editor.commands.setComarkAst(tree); // MarkdownDocument → serializer dispatch table
```

### Strings are markdown

`comark-tiptap` is opinionated: **strings are markdown — never HTML**. `setContent`, `insertContent`, and `insertContentAt` route a string argument through `parseMarkdown`. Pre-parsed content (PM JSON, `Fragment`, `ProseMirrorNode`) passes through untouched; the empty string falls through too, so `clearContent()` keeps its sync semantics.

```ts
editor.commands.setContent("## Section\n\n- a\n- b"); // markdown
editor.commands.insertContent("**bold**", { inline: true }); // inline run at the cursor
```

Escape hatches for a single call (string input only):

```ts
editor.commands.setContent("<h1>Hi</h1>", { contentType: "html" }); // Tiptap's stock HTML pipeline, sync
editor.commands.setContent(JSON.stringify(pmDoc), { contentType: "json" }); // strict PM JSON, sync
editor.commands.setComarkAst('{"nodes":[["p",{},"Hi"]],"frontmatter":{},"meta":{}}'); // JSON-encoded AST
```

Object inputs are auto-detected — a `MarkdownDocument` (anything with a `nodes` array) routes through the AST path; plain PM JSON flows to the stock command.

### Async markdown seed — a divergence from upstream

`parseMarkdown` is **async**, so a markdown string seed (`new Editor({ content })`, `setContent`, `insertContent`) applies one microtask later — the command returns `true` synchronously but the content lands after the parse resolves. Don't read `editor.getJSON()` immediately after a markdown seed; listen on `editor.on('update', …)` or wait a tick. Object paths (PM JSON, `setComarkAst`) stay synchronous.

### Configuration

```ts
ComarkKit.configure({
  starterKit: { heading: { levels: [1, 2, 3] } }, // forwarded to StarterKit (codeBlock/underline always overridden)
  table: { table: { resizable: true } }, // forwarded to TableKit; false to omit
  image: { allowBase64: true }, // forwarded to ComarkImage (inline mode forced by default)
  picture: false, // drop the `<picture>` node (its AST nodes are then dropped, sources included)
  resolveSrc: (src) => cdnUrl(src), // display-only URL resolver, see below
  comment: false, // drop the `<!-- … -->` node
  template: false, // drop the `::template[name]` node
  components: [Alert], // user components from defineComarkComponent
  serializer: {
    injectStyles: true, // operational stylesheet auto-injection
    injectNonce: "csp-token", // CSP nonce for the injected tag
    onError: (err, ctx) => log(err, ctx), // observe async parse/render failures (default: console.warn)
    parserOptions: { linkify: false }, // comark parse options — see below
  },
});
```

`serializer.parserOptions` forwards comark's parse options (plugins, `linkify`, `registerDefaultPlugins`, `autoUnwrap`, `tracer`, …) to every markdown parse. Four keys are withheld: `autoClose` and `headingIds` are invariants the serializer owns (forced off), `unwrap` would break the parse/render round-trip, and `html` is deprecated upstream.

Three input shapes are honored throughout — `string` (markdown), `MarkdownDocument` (AST), `JSONContent` (PM JSON) — and the same three read back out via `getMarkdown()` / `getAst()` / `getJSON()`. `getHTML()` is pure pass-through to Tiptap.

AST nodes whose kit extension is disabled (`picture: false`, `comment: false`, …) are dropped individually on the way in — the rest of the document survives — and each drop is reported through `serializer.onError`.

### Display-only image resolution — `resolveSrc`

CMSs often store image sources as storage-relative keys (`public/products/pump.webp`) and resolve them to CDN URLs only at render time. Verbatim in an editor those keys 404 against the page origin. `resolveSrc` maps stored sources to display URLs without ever touching the stored content:

```ts
ComarkKit.configure({
  resolveSrc: (src) => (src.startsWith("public/") ? `https://cdn.example/${src}` : undefined),
});
```

- Covers the image node's `src` and `srcset` (each candidate URL, descriptors preserved) and every `<picture>` source. Return `undefined` to leave a value untouched.
- One-way and display-only: the PM document, the Comark AST, and markdown output always keep the raw stored value. Parse paths (paste, markdown input rule) store whatever they receive.
- A second `context` argument (`{ attr: 'src' | 'srcset', node: 'image' | 'picture' }`) is available; plain `(src) => …` mappers — e.g. wrapping `@nuxt/image`'s `useImage()` — plug in as-is.
- The resolver also runs per-extension: `image: { resolveSrc }` / `picture: { resolveSrc }` override the kit-level one.

**`getHTML()` caveat**: display HTML is what Tiptap serializes, so `getHTML()` emits _resolved_ URLs. The raw value rides along in `data-comark-src` / `data-comark-srcset` stash attributes — that's also how internal copy-paste (PM's clipboard serializes the display DOM) recovers raw values instead of baking CDN URLs into the document. Store the AST, not HTML.

### Pictures

`<picture>` elements round-trip losslessly through the editor as an opaque inline atom: sources and the inner img are preserved verbatim in `attrs` (selectable/deletable/draggable, not editable from within), and `resolveSrc` applies to their display. A standalone picture serializes back to a top-level element (the paragraph wrapper PM needs for the inline atom hoists out); pictures inside a text run stay inline.

Markdown output round-trips too (comark 0.6+): pictures render as the `picture` directive — the inline form (`:picture[![alt](src)]`) reparses exactly, and the block form's paragraph-wrapped img is re-absorbed on parse.

> [!WARNING]
> Pictures inside **table cells** don't survive _markdown_ output: comark renders the picture as a multi-line block directive and its table renderer space-joins cell content, so the directive syntax is destroyed. AST round-trips are unaffected — keep table+picture documents in AST form.

## Vue — `comark-tiptap/vue`

No UI-library dependency, no design-system opinions — just the editor primitives.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { ComarkEditor, defineComarkVueComponent } from "comark-tiptap/vue";
import type { MarkdownDocument } from "comark-tiptap/vue";
import AlertNodeView from "./AlertNodeView.vue";

const Alert = defineComarkVueComponent({
  name: "alert",
  kind: "block",
  props: { type: { type: "string", default: "info" }, title: { type: "string" } },
  nodeView: AlertNodeView, // → real Vue NodeView via VueNodeViewRenderer
});

const tree = ref<MarkdownDocument>({ nodes: [], frontmatter: {}, meta: {} });
</script>

<template>
  <ComarkEditor v-model.ast="tree" :components="[Alert]" />
</template>
```

### One v-model, four flavors

The `v-model` modifier picks the flavor read back to the ref (input and output stay in the same flavor):

```vue
<ComarkEditor v-model="md" />
<!-- markdown (default) -->
<ComarkEditor v-model.markdown="md" />
<!-- markdown -->
<ComarkEditor v-model.html="html" />
<!-- HTML — Tiptap's stock pipeline -->
<ComarkEditor v-model.json="doc" />
<!-- PM JSON -->
<ComarkEditor v-model.ast="tree" />
<!-- Comark AST -->
```

`:content` is a non-reactive, mount-only seed; `v-model` is live two-way binding and wins when both are set. Markdown seeds resolve **asynchronously** (see above) — the wrapper handles the wait; `ready` / `update` events and the default slot's `is-ready` flag fire when the seed lands.

### Composable

```ts
const md = ref("# Hi\n");
const { editor, setContent, getAst, getMarkdown, getJson, getHtml } = useComarkEditor({
  content: md, // ref/getter → live binding; plain value → mount-only seed
  contentType: "markdown",
});

await setContent("## Replaced\n"); // single setter, dispatches by contentType
await setContent("<p>hi</p>", { contentType: "html" }); // per-call override
await setContent(({ content }) => `${content}\n\nappended`); // functional updater

const tree = getAst(); // MarkdownDocument | null
const markdown = await getMarkdown(); // string | null (async)
```

Pass `kitOptions` to either the component or the composable to forward configuration to `ComarkKit.configure(...)`.

## React — `comark-tiptap/react`

Same surface, React idioms. `<ComarkEditor>` is **controlled** via `value` / `onChange` (React has no `v-model`); the `contentType` prop selects the flavor for both input and output.

```tsx
import { useState } from "react";
import { ComarkEditor, defineComarkReactComponent } from "comark-tiptap/react";
import type { MarkdownDocument } from "comark-tiptap/react";
import AlertNodeView from "./AlertNodeView";

const Alert = defineComarkReactComponent({
  name: "alert",
  kind: "block",
  props: { type: { type: "string", default: "info" }, title: { type: "string" } },
  nodeView: AlertNodeView, // → real React NodeView via ReactNodeViewRenderer
});

function Editor() {
  const [tree, setTree] = useState<MarkdownDocument>({ nodes: [], frontmatter: {}, meta: {} });
  return <ComarkEditor value={tree} onChange={setTree} contentType="ast" components={[Alert]} />;
}
```

Markdown/HTML/JSON/AST flavors work the same way — set `contentType` and bind `value` / `onChange` in that flavor. Markdown seeds resolve **asynchronously** (see above); `onReady` / `onUpdate` fire when the seed lands, and the `fallback` prop renders while the editor is being created.

### Hook

```tsx
const { editor, setContent, getAst, getMarkdown, getJson, getHtml } = useComarkEditor({
  content: "# Hi\n", // mount-only seed
  contentType: "markdown",
});

await setContent("## Replaced\n"); // single setter, dispatches by contentType
await setContent(({ content }) => `${content}\n\nappended`); // functional updater

const tree = getAst(); // MarkdownDocument | null
const markdown = await getMarkdown(); // string | null (async)
```

For full control, pass your own editor: `<ComarkEditor editor={editor}>` renders it and skips the internal one.

## Streaming

Progressively render model-produced markdown — the AI-SDK use case: accumulate the stream into your bound model and flip one flag.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { ComarkEditor } from "comark-tiptap/vue";

const md = ref("");
const streaming = ref(false);

async function generate() {
  streaming.value = true;
  for await (const chunk of aiStream()) md.value += chunk; // v-model feeds the session
  streaming.value = false; // finalize — canonical re-parse, editability restored
}
</script>

<template>
  <ComarkEditor v-model="md" :streaming="streaming" />
</template>
```

React mirrors it: `<ComarkEditor value={md} streaming={isStreaming} onChange={setMd} />`. The Vue composable takes the same reactive option (`useComarkEditor({ streaming })`).

While `streaming` is true, **string** model updates are fed to a stream session as full accumulated snapshots (non-strings are ignored); flipping it back finalizes the document. Semantics:

- The editor is **read-only** for the stream's duration, and streamed transactions are **not undoable** — the content enters like external/collab input.
- Each snapshot applies as a minimal tail replace, coalesced per animation frame: unchanged blocks are untouched, so text grows without flicker or NodeView re-mounts.
- Truncated constructs render optimistically mid-stream (comark's streaming auto-close: an unfinished fence is already a code block, a dangling `**` is already bold). Ending the stream re-parses canonically and corrects any artifact.
- Streamed text is **never echoed back to the bound model** — the caller already owns the markdown. `setContent()` bypasses the session by design.

### The session, framework-free

The flag is sugar over a core primitive on the serializer's storage:

```ts
const session = editor.storage.comark.stream(); // takes the editor read-only

for await (const chunk of aiStream()) {
  accumulated += chunk;
  session.set(accumulated); // full snapshots — applies are frame-coalesced
}
await session.end(); // canonical re-parse + correction, restores editability
```

`session.abort()` drops pending work and keeps the last applied state. Starting a new session aborts any session already active on the editor; destroying the editor aborts too.

## License

[MIT](./LICENSE) © Sandro Circi
