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
- **Stub (dev):** `pnpm dev:prepare` (or `pnpm stub`) — `obuild --stub` symlinks `dist/*` back to `src`, so playgrounds and `tsgo` resolve the workspace `comark-tiptap` without a full build.
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

### Key design patterns

- **Registry-based serializer, not per-extension storage.** `ComarkSerializer.configure({ specs })` carries the dispatch table; `ComarkKit` builds it from `comarkSpecs` (stock set) + user components. This lets the kit use **stock** StarterKit extensions unmodified (free-rides on upstream, stays ecosystem-compatible).
- **`htmlAttrs` added once, globally** via `ComarkAttrs.addGlobalAttributes` (not per extension). User components declare their own `htmlAttrs` in `addAttributes` because their names aren't known when global attrs resolve.
- **Strings are markdown.** `setContent`/`insertContent`/`insertContentAt` route strings through `comark.parse`; `{ contentType: 'html' | 'json' }` are escape hatches. Object inputs auto-detect `ComarkTree` (has a `nodes` array) vs PM JSON.
- **Async markdown seed.** `comark.parse` is async-only — string seeds apply one microtask late. Object paths stay sync. This diverges from `@tiptap/markdown` (sync). See `test/markdown-seed.test.ts`.
- **List autoUnwrap mirrors Comark.** `listItemSpec.toComark` uses `autoUnwrapBlocks`: a single attrless paragraph flattens to inlines; a paragraph followed by a nested list keeps its wrapper (`['li',{},['p',{},'a'],['ul',…]]`). This matches comark ≥ 0.3.2's canonical form.

### Build

- **obuild, one `type: "bundle"` entry per subpath.** Core roots at `src/index.ts` (its graph never touches the framework dirs, so the core dist has zero framework dependency); `src/vue/index.ts` and `src/react/index.ts` each mark `comark-tiptap` (+ the framework peers) external.
- **Vue `<ComarkEditor>` is a `.ts` `defineComponent`, not an SFC.** obuild's released transform can't compile `.vue` (its plugin API isn't wired into `type: "transform"`); a render-function component gives clean `.d.ts` with full prop/emit/slot types through one toolchain. React is authored in `.tsx` (oxc handles JSX → automatic runtime).

## Testing conventions

- Tests live in `test/`, mirroring `src/`, importing `../src/…` directly (reach internals, not just the public barrel).
- **DOM tests** declare `@vitest-environment happy-dom` in a docblock pragma; the rest run in `node`. Vue tests mount via a small `createApp` (no `@vue/test-utils`); React tests use `@testing-library/react` (`renderHook` / `render`).
- **No dynamic imports in tests** — static top-level imports only.

## Code conventions

- ESM, type-first, modern JS. Prefer Web APIs over Node APIs.
- Formatting is `oxfmt`: single quotes, no semicolons, 2-space, trailing commas. Run `pnpm fmt`.
- **Comments** only for maintenance / strange edge cases. **JSDoc** focuses on _how_ (not _why_), stays brief, and provides examples + types where useful downstream.
- Study surrounding patterns before adding code.

## Playgrounds

- `playground/vue` — general Vite + Vue playground: the managed `<ComarkEditor v-model>`, `defineComarkVueComponent`, and the output flavors.
- `playground/react` — general Vite + React playground: the controlled `<ComarkEditor value onChange>`, `defineComarkReactComponent`, and the output flavors.
- `playground/nuxt` — **sole purpose:** prepare the Nuxt UI upstream change for `<UEditor>`. `UComarkEditor.vue` is a near-verbatim fork of Nuxt UI's `<UEditor>` with `useComarkEditor` swapped in; the page runs it side-by-side with stock `<UEditor>`. Nuxt 4 + `@nuxt/ui@4.9`. Does **not** duplicate the Vue playground's general experimentation.

## Notes / backlog

- **comark version.** Peer is `comark@^0.3.1` (matches the tested round-trips). comark `0.5.0` exists but may change the AST/parse surface the serializer depends on — bumping needs a serializer review + full round-trip re-verification before it lands.
- **`SetContentOptions`** is still defined per-binding (each extends core's `SetComarkContentOptions` with `contentType`); minor, could be lifted to core too.
- **BYO-editor timing.** `<ComarkEditor editor={…}>` decides managed-vs-BYO at first render, so passing an editor that isn't ready yet (e.g. straight from `useComarkEditor`) falls into managed mode and spins an unused internal editor. Both playgrounds use managed mode (`v-model` / `value`+`onChange`) to avoid this; consumers wanting true BYO should pass an already-created editor.
