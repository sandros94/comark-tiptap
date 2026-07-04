<!-- Keep this file updated as the project evolves. When making architectural changes, adding patterns, or discovering conventions, update the relevant sections. -->

# comark-tiptap — Agent Guide

`comark-tiptap` is a [Comark](https://github.com/comarkdown/comark)-aware [Tiptap](https://tiptap.dev) kit that round-trips losslessly between Tiptap's ProseMirror schema, the Comark AST, and markdown. It ships as **one package with subpath entries**: `comark-tiptap` (framework-agnostic core), `comark-tiptap/vue` (Vue 3), and `comark-tiptap/react` (React). Each framework and its Tiptap binding (`vue`/`@tiptap/vue-3`, `react`/`react-dom`/`@tiptap/react`) are **optional** peer deps.

## Core Principle — Ask First

**When in doubt, ask before acting.** Understanding the vision beats assuming. No wasted time in asking — this applies to every task.

### Q&A Sessions

For design decisions, ambiguity, or vision changes, run a structured Q&A before implementing:

- Each question: **2–4 labeled options** (A/B/C/D), 1–2 sentences each, with a marked preference. The answer can pick, mix, or override.
- No open-ended questions — propose options, even as best guesses.
- Number questions with a short kebab-case title for cross-reference.
- Prefer multiple focused rounds (2–5 questions each). Synthesize + confirm before implementing.

## Commands

- **Build:** `pnpm build` (obuild) — emits `dist/index.mjs` (core) + `dist/vue/index.mjs` + `dist/react/index.mjs`, each bundled with `.d.mts`.
- **Stub (dev):** `pnpm dev:prepare` — `obuild --stub` symlinks `dist/*` back to `src`, so playgrounds and `tsgo` resolve the workspace `comark-tiptap` without a full build.
- **Test:** `pnpm test` (vitest). Single file: `pnpm vitest run test/serializer.test.ts`.
- **Typecheck:** `pnpm typecheck` (`tsgo --noEmit`).
- **Lint:** `pnpm lint` (`oxlint` type-aware + `oxfmt --check`). **Format:** `pnpm fmt`.
- **Playgrounds:** `pnpm dev:vue` / `pnpm dev:react` / `pnpm dev:nuxt`; `pnpm typecheck:playgrounds`.

## Architecture

Single package, subpath exports:

- `comark-tiptap` — `ComarkKit`, the serializer, per-node/mark specs, `defineComarkComponent`, utils. No framework code.
- `comark-tiptap/vue` — `<ComarkEditor>`, `useComarkEditor`, `defineComarkVueComponent`.
- `comark-tiptap/react` — `<ComarkEditor>`, `useComarkEditor`, `defineComarkReactComponent`.

Each framework binding imports the core **by package name** (`comark-tiptap`, self-referenced via `exports`), kept external at build time so the core is never re-bundled. Framework bindings mirror each other's surface, adapted to each framework's idioms (Vue `v-model` + modifiers; React controlled `value`/`onChange` + `contentType`).

### Source layout

```
src/
  index.ts              # core barrel
  kit.ts                # ComarkKit — assembles StarterKit + tables + image + comark nodes + serializer
  serializer.ts         # ComarkSerializer extension + createSerializer (pure dispatcher) + PM↔Comark commands
  content.ts            # @internal content-routing helpers shared by the bindings (applyContent/readByFlavor/isComarkTreeLike/safeJson)
  attrs.ts              # ComarkAttrs — global `htmlAttrs` bag via addGlobalAttributes
  style.ts              # operational stylesheet (comment/template/component markers)
  types.ts              # NodeSpec / MarkSpec / ComarkHelpers + re-exported comark types
  extensions/           # comark-specific Tiptap nodes: code-block, comment, template, component (factory)
  specs/                # per-node/mark serialization specs (paragraph, heading, lists, table, marks, …) + comarkSpecs aggregate
  utils/                # attrs (split/merge/clean), auto-unwrap, html-attrs
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
```

The framework-agnostic `ContentType` / `ContentValue` / `SetterContext` / `SetterInput` types live in core (`src/types.ts`, exported from `comark-tiptap`); each binding imports and re-exports them. `SetterContext.editor` is typed as `@tiptap/core`'s `Editor` (React's `Editor` _is_ it; Vue's extends it).

The identical content-dispatch/read logic each binding needs (`applyContent`, `readByFlavor`, `isComarkTreeLike`, `safeJson`) lives once in `src/content.ts`, exported `@internal` from the barrel and imported by the bindings by package name. The stateful shadow-guard orchestration (echo-loop dedup, seed sequencing) stays per-binding — it's framework-shaped (Vue `watch`/emit vs React `useEffect`/`onChange`) and doesn't factor cleanly into a shared primitive.

### Key design patterns

- **Registry-based serializer, not per-extension storage.** `ComarkSerializer.configure({ specs })` carries the dispatch table; `ComarkKit` builds it from `comarkSpecs` (stock set) + user components. This lets the kit use **stock** StarterKit extensions unmodified (free-rides on upstream, stays ecosystem-compatible).
- **`htmlAttrs` added once, globally** via `ComarkAttrs.addGlobalAttributes` (not per extension). User components declare their own `htmlAttrs` in `addAttributes` because their names aren't known when global attrs resolve.
- **Strings are markdown.** `setContent`/`insertContent`/`insertContentAt` route strings through `comark.parse`; `{ contentType: 'html' | 'json' }` are escape hatches. Object inputs auto-detect `ComarkTree` (has a `nodes` array) vs PM JSON.
- **Async markdown seed.** `comark.parse` is async-only — string seeds apply one microtask late. Object paths stay sync. This diverges from `@tiptap/markdown` (sync). See `test/markdown-seed.test.ts`.
- **List autoUnwrap mirrors Comark.** `listItemSpec.toComark` uses `autoUnwrapBlocks`: a single attrless paragraph flattens to inlines; a paragraph followed by a nested list keeps its wrapper (`['li',{},['p',{},'a'],['ul',…]]`). This matches comark's canonical form (verified on 0.5.0).
- **Inline mark nesting is reconstructed, not per-run.** PM stores marks flat on each text run; `serializeInlines` (serializer.ts) rebuilds Comark nesting by grouping consecutive runs that share an outer mark into ONE element (`**a _b_ c**` → `['strong',{},'a ',['em',{},'b'],' c']`, not three `strong`s — the naive per-run wrap loses edge whitespace and splits a link into several). Two rules: (1) coalesce adjacent runs whose mark at a given depth is identical (type + attrs; differing `htmlAttrs` stay separate); (2) force the `code` mark **innermost** regardless of PM's mark order — inline code is literal in markdown, so a mark nested inside `code` (`['code',{},['em',…]]`) is dropped on render. `MarkSpec.toComark(mark, children)` takes an array so one wrapper can hold many children. Pinned by `test/serializer.test.ts` + `test/markdown-output.test.ts`.
- **Link `target`/`rel` aren't auto-injected.** The kit nulls the bundled Link extension's default `target`/`rel` HTMLAttributes (kit.ts), so a plain `[x](/y)` round-trips clean instead of gaining `{target rel}`; explicit values from the markdown still ride on the link mark.
- **Cell alignment bridges `style:text-align` ↔ native `align`.** comark expresses table alignment as `style:"text-align:X"`, its renderer ignores a bare `align` attr, and Tiptap's TableCell renders `align` back as that style. The cell spec reads either form into PM's native `align` and serializes it back as `style:text-align`; `style` is reserved on cells (attrs.ts) so a DOM round-trip doesn't double-represent it.

### Build

- **obuild, one `type: "bundle"` entry per subpath.** Core roots at `src/index.ts` (its graph never touches the framework dirs, so the core dist has zero framework dependency); `src/vue/index.ts` and `src/react/index.ts` each mark `comark-tiptap` (+ the framework peers) external.
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

- `playground/vue` — general Vite + Vue playground: the managed `<ComarkEditor v-model>`, `defineComarkVueComponent`, and the output flavors.
- `playground/react` — general Vite + React playground: the controlled `<ComarkEditor value onChange>`, `defineComarkReactComponent`, and the output flavors.
- `playground/nuxt` — **sole purpose:** prepare the Nuxt UI upstream change for `<UEditor>`. `UComarkEditor.vue` is a near-verbatim fork of Nuxt UI's `<UEditor>` with `useComarkEditor` swapped in; the page runs it side-by-side with stock `<UEditor>`. Nuxt 4 + `@nuxt/ui@4.9`. Does **not** duplicate the Vue playground's general experimentation.

## Notes / backlog

- **comark version.** Peer + dev are pinned to `comark@^0.5.0` (the tested round-trips run against 0.5.0). The parse AST surface is unchanged from 0.3.x (`[tag, attrs, …children]`, heading auto-`id`, `del`, string `start`, `style:"text-align:X"` on cells); 0.5.0's only relevant render change vs 0.3.2 is that ordered-list `start` is now emitted. Bumping again needs a serializer review + full round-trip re-verification before it lands.
- **`SetContentOptions`** is still defined per-binding (each extends core's `SetComarkContentOptions` with `contentType`); minor, could be lifted to core too.
- **Streaming auto-close is off.** All `parse()` calls pass `{ autoClose: false }` (serializer.ts `PARSE_OPTIONS`). comark's default closes dangling markers (a lone `*`/`~`/`$name`) — right for streaming, wrong for the complete docs the editor parses (it corrupts literal text; see comarkdown/comark#136). Do not re-enable it for whole-document parsing.
- **BYO-editor timing is keyed off prop PRESENCE.** `<ComarkEditor editor={…}>` selects BYO vs managed by whether the `editor` prop is provided (React `"editor" in props`; Vue `"editor" in vnode.props`), NOT its current value — so `:editor`/`editor={hook.editor}` that resolves a tick after mount stays in the BYO branch (rendering the `fallback`) instead of spinning a throwaway internal editor. Pass the prop (even as an undefined ref) to opt into BYO; omit it for managed mode. Don't reintroduce a truthiness check.
