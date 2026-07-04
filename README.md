# comark-tiptap

A [Comark](https://github.com/comarkdown/comark)-aware [Tiptap](https://tiptap.dev) kit. Built on `@tiptap/starter-kit` + tables + image, it adds a thin layer that round-trips **losslessly** between Tiptap's ProseMirror schema, the Comark AST, and markdown — plus optional framework bindings.

- **`comark-tiptap`** — the framework-agnostic core (`ComarkKit`, serializer, specs).
- **`comark-tiptap/vue`** — Vue 3 bindings (`<ComarkEditor>`, `useComarkEditor`, Vue NodeView helpers).
- **`comark-tiptap/react`** — React bindings (`<ComarkEditor>`, `useComarkEditor`, React NodeView helpers).

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

`ComarkKit` is a single `Extension.create` that registers StarterKit + tables + image + the comark-specific nodes (`ComarkComment`, `ComarkTemplate`), the global `htmlAttrs` declaration, and the serializer. The schema is whatever Tiptap upstream ships — no per-extension reimplementations — so it stays drop-in compatible with the rest of the Tiptap ecosystem.

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

editor.storage.comark.getAst(); // ComarkTree (sync)
await editor.storage.comark.getMarkdown(); // string (async — comark/render)
editor.commands.setComarkMarkdown("# Hi"); // markdown → comark.parse
editor.commands.setComarkAst(tree); // ComarkTree → serializer dispatch table
```

### Strings are markdown

`comark-tiptap` is opinionated: **strings are markdown — never HTML**. `setContent`, `insertContent`, and `insertContentAt` route a string argument through `comark.parse`. Pre-parsed content (PM JSON, `Fragment`, `ProseMirrorNode`) passes through untouched; the empty string falls through too, so `clearContent()` keeps its sync semantics.

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

Object inputs are auto-detected — a `ComarkTree` (anything with a `nodes` array) routes through the AST path; plain PM JSON flows to the stock command.

### Async markdown seed — a divergence from upstream

`comark.parse` is **async**, so a markdown string seed (`new Editor({ content })`, `setContent`, `insertContent`) applies one microtask later — the command returns `true` synchronously but the content lands after the parse resolves. Don't read `editor.getJSON()` immediately after a markdown seed; listen on `editor.on('update', …)` or wait a tick. Object paths (PM JSON, `setComarkAst`) stay synchronous.

### Configuration

```ts
ComarkKit.configure({
  starterKit: { heading: { levels: [1, 2, 3] } }, // forwarded to StarterKit (codeBlock/underline always overridden)
  table: { table: { resizable: true } }, // forwarded to TableKit; false to omit
  image: { allowBase64: true }, // forwarded to Image (inline mode forced by default)
  comment: false, // drop the `<!-- … -->` node
  template: false, // drop the `::template[name]` node
  components: [Alert], // user components from defineComarkComponent
  serializer: { injectStyles: true, injectNonce: "csp-token" }, // operational stylesheet auto-injection
});
```

Three input shapes are honored throughout — `string` (markdown), `ComarkTree` (AST), `JSONContent` (PM JSON) — and the same three read back out via `getMarkdown()` / `getAst()` / `getJSON()`. `getHTML()` is pure pass-through to Tiptap.

## Vue — `comark-tiptap/vue`

No UI-library dependency, no design-system opinions — just the editor primitives.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { ComarkEditor, defineComarkVueComponent } from "comark-tiptap/vue";
import type { ComarkTree } from "comark-tiptap/vue";
import AlertNodeView from "./AlertNodeView.vue";

const Alert = defineComarkVueComponent({
  name: "alert",
  kind: "block",
  props: { type: { type: "string", default: "info" }, title: { type: "string" } },
  nodeView: AlertNodeView, // → real Vue NodeView via VueNodeViewRenderer
});

const tree = ref<ComarkTree>({ nodes: [], frontmatter: {}, meta: {} });
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

const tree = getAst(); // ComarkTree | null
const markdown = await getMarkdown(); // string | null (async)
```

Pass `kitOptions` to either the component or the composable to forward configuration to `ComarkKit.configure(...)`.

## React — `comark-tiptap/react`

Same surface, React idioms. `<ComarkEditor>` is **controlled** via `value` / `onChange` (React has no `v-model`); the `contentType` prop selects the flavor for both input and output.

```tsx
import { useState } from "react";
import { ComarkEditor, defineComarkReactComponent } from "comark-tiptap/react";
import type { ComarkTree } from "comark-tiptap/react";
import AlertNodeView from "./AlertNodeView";

const Alert = defineComarkReactComponent({
  name: "alert",
  kind: "block",
  props: { type: { type: "string", default: "info" }, title: { type: "string" } },
  nodeView: AlertNodeView, // → real React NodeView via ReactNodeViewRenderer
});

function Editor() {
  const [tree, setTree] = useState<ComarkTree>({ nodes: [], frontmatter: {}, meta: {} });
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

const tree = getAst(); // ComarkTree | null
const markdown = await getMarkdown(); // string | null (async)
```

For full control, pass your own editor: `<ComarkEditor editor={editor}>` renders it and skips the internal one.

## License

[MIT](./LICENSE) © Sandro Circi
