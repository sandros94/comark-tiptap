<!-- Keep this file updated as the project evolves. When making architectural changes, adding patterns, or discovering conventions, update the relevant sections. -->

# comark-tiptap — Agent Guide

`comark-tiptap` is a [Comark](https://github.com/comarkdown/comark)-aware [Tiptap](https://tiptap.dev) kit that round-trips losslessly between Tiptap's ProseMirror schema, the Comark AST, and markdown. It ships as **one package with subpath entries**: `comark-tiptap` (framework-agnostic core), `comark-tiptap/vue` (Vue 3), `comark-tiptap/react` (React), and `comark-tiptap/internal` (binding plumbing, not semver-covered). Each framework and its Tiptap binding (`vue`/`@tiptap/vue-3`, `react`/`react-dom`/`@tiptap/react`) are **optional** peer deps.

## Core Principle — Ask First

**When in doubt, ask before acting.** Understanding the vision beats assuming. No wasted time in asking — this applies to every task.

### Q&A Sessions

For design decisions, ambiguity, or vision changes, run a structured Q&A before implementing:

- Each question: **2–4 labeled options** (A/B/C/D), 1–2 sentences each, with a marked preference. The answer can pick, mix, or override.
- No open-ended questions — propose options, even as best guesses.
- Number questions with a short kebab-case title for cross-reference.
- Prefer multiple focused rounds (2–5 questions each). Synthesize + confirm before implementing.

## Commands

- **Build:** `pnpm build` (obuild) — emits `dist/index.mjs` (core) + `dist/internal.mjs` + `dist/vue/index.mjs` + `dist/react/index.mjs`, each bundled with `.d.mts`.
- **Stub (dev):** `pnpm dev:prepare` — `obuild --stub` symlinks `dist/*` back to `src`, so playgrounds and `tsc` resolve the workspace `comark-tiptap` without a full build.
- **Test:** `pnpm test` (vitest). Single file: `pnpm vitest run test/serializer.test.ts`.
- **Nuxt integration:** `pnpm test:nuxt` (`@nuxt/test-utils/runtime`) — runs separately in CI; root Vitest excludes `playgrounds/**`.
- **Typecheck:** `pnpm typecheck` (`tsc --noEmit` — native TypeScript 7; the vue/nuxt playgrounds stay on TS 6 for vue-tsc).
- **Lint:** `pnpm lint` (`oxlint` type-aware + `oxfmt --check`). **Format:** `pnpm fmt`.
- **Playgrounds:** `pnpm dev:vue` / `pnpm dev:react` / `pnpm dev:nuxt`; `pnpm typecheck:playgrounds`.

## Architecture

Single package, subpath exports:

- `comark-tiptap` — `ComarkKit`, the serializer, per-node/mark specs, `defineComarkComponent`, utils. No framework code.
- `comark-tiptap/vue` — `<ComarkEditor>`, `useComarkEditor`, `defineComarkVueComponent`.
- `comark-tiptap/react` — `<ComarkEditor>`, `useComarkEditor`, `defineComarkReactComponent`.
- `comark-tiptap/internal` — the content-routing helpers the bindings share. Not part of the semver-supported public API.

Each framework binding imports the core **by package name** (`comark-tiptap`, self-referenced via `exports`), kept external at build time so the core is never re-bundled. Framework bindings mirror each other's surface, adapted to each framework's idioms (Vue `v-model` + modifiers; React controlled `value`/`onChange` + `contentType`).

### Source layout

```
src/
  index.ts              # core barrel
  internal.ts           # `comark-tiptap/internal` barrel — re-exports content.ts for the bindings
  kit.ts                # ComarkKit — assembles StarterKit + tables + image + picture + comark nodes + serializer
  serializer.ts         # ComarkSerializer extension + createSerializer (pure dispatcher) + PM↔Comark commands
  stream.ts             # stream session (progressive markdown) behind storage.comark.stream()
  content.ts            # @internal content-routing helpers shared by the bindings (applyContent/readByFlavor/isMarkdownDocumentLike/safeJson)
  attrs.ts              # ComarkAttrs — global `htmlAttrs` bag via addGlobalAttributes
  style.ts              # operational stylesheet (comment/template/component markers)
  types.ts              # NodeSpec / MarkSpec / ComarkHelpers + re-exported comark types
  extensions/           # comark-specific Tiptap nodes: code-block, comment, template, image (resolveSrc), picture, component (factory)
  specs/                # per-node/mark serialization specs (paragraph, heading, lists, table, marks, …) + exact.ts (1:1 tag factories) + comarkSpecs aggregate
  utils/                # attrs (split/merge/read the htmlAttrs bag), auto-unwrap (both paragraph-unwrap rules), html-attrs, srcset (candidate parsing), resolve-src (display URL + raw stash)
  vue/
    index.ts            # vue barrel
    comark-editor.ts    # <ComarkEditor> as a `defineComponent` (see "Build" below)
    use-comark-editor.ts# useComarkEditor composable
    define-component.ts # defineComarkVueComponent — wraps the core factory with VueNodeViewRenderer
    comark-editor.types.ts
  react/
    index.ts            # react barrel
    comark-editor.tsx   # controlled <ComarkEditor> (value/onChange) + BYO-editor branch
    use-comark-editor.ts# useComarkEditor hook (wraps @tiptap/react useEditor)
    define-component.ts # defineComarkReactComponent — wraps the core factory with ReactNodeViewRenderer
test/                   # mirrors src/ (imports ../src/…); DOM tests opt into happy-dom via `@vitest-environment` pragma
test/upstream/          # pins comark's own behavior (streaming/autoClose) — a canary for comark bumps, tests comark alone
```

The framework-agnostic `ContentType` / `ContentValue` / `SetterContext` / `SetterInput` types live in core (`src/types.ts`, exported from `comark-tiptap`); each binding imports and re-exports them. `SetterContext.editor` is typed as `@tiptap/core`'s `Editor` (React's `Editor` _is_ it; Vue's extends it).

The identical content-dispatch/read logic each binding needs (`applyContent`, `readByFlavor`, `isMarkdownDocumentLike`, `safeJson`, `createPushScheduler`) lives once in `src/content.ts`, exported via the `comark-tiptap/internal` subpath and imported by the bindings by package name. The stateful shadow-guard orchestration (echo-loop dedup, seed sequencing) stays per-binding — it's framework-shaped (Vue `watch`/emit vs React `useEffect`/`onChange`) and doesn't factor cleanly into a shared primitive.

The stream session (`src/stream.ts`, reached via `storage.comark.stream()`) owns ONE `createMarkdownParser` instance per session — comark's `{ streaming: true }` mode reuses previously parsed top-level nodes by reference and returns the previous good tree if a mid-stream parse fails; the returned trees are that parser's incremental cache and must never be mutated (their `$.line` markers anchor the next tick). Ticks are frame-coalesced, string-deduped, serialized (never two parses in flight), and land as one block-prefix tail replace stamped `MODEL_APPLY_META` + `addToHistory: false`. Editability is a **baton on storage** (`streamBaselineEditable`): the first session of a supersede chain captures it, only the currently registered session restores it. The bindings' `streaming` flag is thin sugar routing string model updates into a session.

Model pushes are **microtask-coalesced** (a burst of updates in one task collapses into one serialize+emit reading the latest state) and **sequence-stamped**: every doc-changing update and every outside-in apply bumps a counter, and an async markdown render whose counter is stale (or whose editor was destroyed meanwhile) is discarded instead of emitted. The counter mechanics are framework-free and live once in `createPushScheduler` (`src/content.ts`, `@internal`); each binding owns one instance. Outside-in applies tag their transaction with `transactionMeta: { [MODEL_APPLY_META]: true }` (`src/content.ts`), and the binding's `onUpdate` returns before scheduling a push for a tagged transaction — the echo never serializes. `onUpdate` callbacks (both composable/hook options and the Vue `update` emit) receive `(editor, transaction)`.

### Key design patterns

- **Registry-based serializer, not per-extension storage.** `ComarkSerializer.configure({ specs })` carries the dispatch table; `ComarkKit` builds it from `comarkSpecs` (stock set) + user components. This lets the kit use **stock** StarterKit extensions unmodified (free-rides on upstream, stays ecosystem-compatible).
- **`storage.comark.getAst()` is memoized single-slot** on PM doc identity plus `frontmatter` / `meta` reference identity. The PM doc is immutable and `setComarkAst` / `setContent` replace the two bags with fresh spreads, so identity is a sound key. The returned document is a shared snapshot — treat it as read-only. `getMarkdown()` layers a second single-slot memo on top, keyed on that tree's reference, so a re-read of an unchanged doc skips `renderMarkdown`.
- **`transactionMeta` rides the content commands.** `SetComarkContentOptions.transactionMeta` is stamped once at the top of the `setContent` / `insertContent` / `insertContentAt` overrides; Tiptap command chains share one transaction, so every synchronous branch (AST object, HTML/pass-through, JSON) inherits it, and the async markdown branch forwards the options to the re-entrant apply, which stamps the deferred transaction. Reachable in `onUpdate` via `transaction.getMeta(key)`.
- **`htmlAttrs` added once, globally** via `ComarkAttrs.addGlobalAttributes` (not per extension). User components declare their own `htmlAttrs` in `addAttributes` because their names aren't known when global attrs resolve.
- **Strings are markdown.** `setContent`/`insertContent`/`insertContentAt` route strings through `parseMarkdown`; `{ contentType: 'html' | 'json' }` are escape hatches. Object inputs auto-detect `MarkdownDocument` (has a `nodes` array) vs PM JSON.
- **Async markdown seed.** `parseMarkdown` is async-only — string seeds apply one microtask late. Object paths stay sync. This diverges from `@tiptap/markdown` (sync). See `test/markdown-seed.test.ts`.
- **The paragraph-unwrap policy lives in `utils/auto-unwrap.ts`.** Two rules, both there: `autoUnwrapBlocks` (a container — listItem, blockquote, template, table cell, block component — flattens a single attrless paragraph child to inlines, while a paragraph followed by a nested list keeps its wrapper: `['li',{},['p',{},'a'],['ul',…]]`, comark's canonical form, verified on 0.6.2) and `hoistSoleInlineBlockAtom` (the picture hoist below). They stay two calls rather than one dispatcher because they fire at different levels — a container decides about its children, a paragraph about itself, and the doc root takes the hoist but never the container flattening.
- **Inline mark nesting is reconstructed, not per-run.** PM stores marks flat on each text run; `serializeInlines` (serializer.ts) rebuilds Comark nesting by grouping consecutive runs that share an outer mark into ONE element (`**a _b_ c**` → `['strong',{},'a ',['em',{},'b'],' c']`, not three `strong`s — the naive per-run wrap loses edge whitespace and splits a link into several). Two rules: (1) coalesce adjacent runs whose mark at a given depth is identical (type + attrs; differing `htmlAttrs` stay separate); (2) force the `code` mark **innermost** regardless of PM's mark order — inline code is literal in markdown, so a mark nested inside `code` (`['code',{},['em',…]]`) is dropped on render. `MarkSpec.toComark(mark, children)` takes an array so one wrapper can hold many children. Pinned by `test/serializer.test.ts` + `test/markdown-output.test.ts`.
- **`resolveSrc` is display-only, hooked at attribute-level `renderHTML`.** `ComarkImage` (extends stock Image, keeps the `image` name) and `ComarkPicture` map `src`/`srcset` through the kit-level `resolveSrc` in the attrs' `renderHTML` — one seam covering plain rendering AND the resize node view (`@tiptap/core` feeds node views `getRenderedAttributes(...)`). Stored attrs / AST / markdown stay raw. When the resolver changes a value, the raw one rides in `data-comark-src(set)` and parse prefers the stash — otherwise PM's clipboard (which serializes the display DOM) would bake resolved URLs into the document on internal copy-paste.
- **Picture is an opaque INLINE atom with a block-hoist on the way out.** comark emits `<picture>` both block-level and inside text runs; a PM node has one group, and a block group would make in-paragraph pictures fail schema validation — inline survives both. `pictureSpec` declares `context: 'inline-block'`: on serialization, an attrless paragraph whose ONLY child is a picture hoists back to the bare top-level element (`hoistSoleInlineBlockAtom`, called from `paragraphSpec.toComark`) — comark's canonical shape for a block picture, and rendering the directive under `p` over-indents its body so sources reparse as a code block (upstream renderer bug). Sources + inner img are verbatim attr bags; `pictureSpec` normalizes child order to sources-then-img and descends through wrapper elements on parse (the block markdown form paragraph-wraps the inner img).
- **Disabled-extension AST nodes are pruned individually.** Serializer specs are registered unconditionally, so `picture: false` / `comment: false` yield PM JSON with schema-unknown types; `pruneUnknownTypes` (serializer.ts) drops just those nodes/marks before `setContent` (reported via `onError`). Without it, Tiptap's content check resets the WHOLE document on the first unknown type.
- **Link `target`/`rel` aren't auto-injected.** The kit nulls the bundled Link extension's default `target`/`rel` HTMLAttributes (kit.ts), so a plain `[x](/y)` round-trips clean instead of gaining `{target rel}`; explicit values from the markdown still ride on the link mark.
- **Cell alignment bridges `style:text-align` ↔ native `align`.** comark expresses table alignment as `style:"text-align:X"`, its renderer ignores a bare `align` attr, and Tiptap's TableCell renders `align` back as that style. The cell spec reads either form into PM's native `align` and serializes it back as `style:text-align`; `style` is reserved on cells (attrs.ts) so a DOM round-trip doesn't double-represent it.

### Build

- **obuild: three `type: "bundle"` entries.** Core (`src/index.ts`) and the binding-support entry (`src/internal.ts`) share ONE bundle entry, so rolldown splits their common modules into `dist/_chunks/` — `content.ts` exists once at runtime instead of once per bundle (a separate entry would duplicate it, which is only safe while everything there stays stateless and identity-free; the shared chunk removes that invariant). The core graph never touches the framework dirs, so its dist has zero framework dependency; `src/vue/index.ts` and `src/react/index.ts` each mark `comark-tiptap` **including its subpaths** (`/^comark-tiptap(\/|$)/`, they import `comark-tiptap/internal` too) plus the framework peers external.
- **Vue `<ComarkEditor>` is a `.ts` `defineComponent`, not an SFC.** obuild's released transform can't compile `.vue` (its plugin API isn't wired into `type: "transform"`); a render-function component gives clean `.d.ts` with full prop/emit/slot types through one toolchain. React is authored in `.tsx` (oxc handles JSX → automatic runtime).

## Testing conventions

- Tests live in `test/`, mirroring `src/`, importing `../src/…` directly (reach internals, not just the public barrel).
- **DOM tests** declare `@vitest-environment happy-dom` in a docblock pragma; the rest run in `node`. Vue tests mount via a small `createApp` (no `@vue/test-utils`); React tests use `@testing-library/react` (`renderHook` / `render`).
- **No dynamic imports in tests** — static top-level imports only.

## Code conventions

- ESM, type-first, modern JS. Prefer Web APIs over Node APIs.
- Formatting is `oxfmt`: double quotes, semicolons, 2-space, trailing commas (see `.oxfmtrc.json`). Run `pnpm fmt`.
- **Comments** only for maintenance / strange edge cases. **JSDoc** focuses on _how_ (not _why_), stays brief, and provides examples + types where useful downstream.
- Study surrounding patterns before adding code.

## Playgrounds

- `playgrounds/vue` — general Vite + Vue playground: the managed `<ComarkEditor v-model>`, `defineComarkVueComponent`, and the output flavors.
- `playgrounds/react` — general Vite + React playground: the controlled `<ComarkEditor value onChange>`, `defineComarkReactComponent`, and the output flavors.
- `playgrounds/nuxt` — **sole purpose:** exercise Nuxt UI's external-editor support in `<UEditor>`. Its page compares built-in UEditor with one given a real `useComarkEditor` instance; the external editor owns content, schema and lifecycle. There is no local UEditor fork. The exact `@nuxt/ui` PR preview and `playgrounds/nuxt/test/nuxt/ueditor-external.test.ts` stay pinned until upstream support ships; the dedicated Nuxt Vitest gate runs in CI. Does **not** duplicate the Vue playground's general experimentation.

## Notes / backlog

- **comark version.** Peer + dev are pinned to `comark@^0.6.2` (the tested round-trips run against 0.6.2). 0.6.0 renamed the whole public API (`parse`→`parseMarkdown`, `ComarkTree`→`MarkdownDocument`, `ComarkElement`→`ElementNode`, `ComarkNode`→`Node`, `ComarkText`→`TextNode`, `ComarkComment`→`CommentNode`) — our re-exports follow the new names. The AST shape is unchanged (`[tag, attrs, …children]`, `del`, string `start`, `style:"text-align:X"` on cells); render now escapes literal `*`/`~`/backticks in text (idempotent — pinned in `test/markdown-output.test.ts`). Bumping again needs a serializer review + full round-trip re-verification before it lands.
- **`SetContentCallOptions`** (core `content.ts`, internal entry) is the shared per-call `setContent` shape; both bindings re-export it, keeping the old `SetContentOptions` name as a deprecated alias until v0.2. Deliberately not named `SetContentOptions` — that name is the `@tiptap/core` interface this package augments in `serializer.ts`.
- **Picture markdown round-trips since comark 0.6** (inline directive form reparses; block form paragraph-wraps the img, which `pictureSpec.fromComark` re-absorbs). Remaining upstream renderer bugs: (a) a block `picture` directive rendered UNDER a `p` wrapper over-indents its body (4 spaces) so `:::source` reparses as an indented code block — we sidestep it via the sole-child hoist, but a paragraph carrying htmlAttrs (or a mark, e.g. a link) around a lone picture still hits it; (b) pictures inside TABLE CELLS are destroyed on markdown output (comark space-joins cell content, flattening the multi-line directive; documented in README). Both worth filing upstream.
- **`del`+`code` markdown output is still lossy upstream (0.6.2).** `['del',{},['code',{},'x']]` renders `~~x~~` — the code span vanishes (`em`/`strong` around code are fine). Parse of ``~~`x`~~`` is correct; only render drops it. AST/DOM paths unaffected. Worth filing upstream (clean comark-only repro).
- **Heading auto-ids are off.** `PARSE_OPTIONS` passes `headingIds: false` (0.6 option): an auto-generated id stored on the PM node is derived data that goes stale when the heading is renamed, and comark's `renderMarkdown` suppresses heading ids anyway (note: that suppression also drops EXPLICIT `{id="…"}` heading ids from markdown output — upstream bug worth filing; they survive AST and DOM paths through `htmlAttrs`).
- **autoClose is split by mode.** Whole-document parses pass `{ autoClose: false }` (serializer.ts `PARSE_OPTIONS`): comark's default closes dangling markers, and `"text with **partial"` — a complete doc without a trailing newline — would gain a `<strong>`. Do not re-enable it there. Stream sessions (`src/stream.ts`) deliberately leave it ON (comark's streaming default): optimistically closing a truncated tail is the point, and `end()`'s canonical re-parse corrects any artifact. `test/upstream/comark-streaming.test.ts` pins the truncation behavior both ways.
- **BYO-editor timing is keyed off prop PRESENCE.** `<ComarkEditor editor={…}>` selects BYO vs managed by whether the `editor` prop is provided (React `"editor" in props`; Vue `"editor" in vnode.props`), NOT its current value — so `:editor`/`editor={hook.editor}` that resolves a tick after mount stays in the BYO branch (rendering the `fallback`) instead of spinning a throwaway internal editor. Pass the prop (even as an undefined ref) to opt into BYO; omit it for managed mode. Don't reintroduce a truthiness check.
