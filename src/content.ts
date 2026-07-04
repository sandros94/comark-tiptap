import type { Content, Editor } from '@tiptap/core'
import type { SetComarkContentOptions } from './serializer'
import type { ComarkTree, ContentType, ContentValue, JSONContent } from './types'

/*
 * Content-routing helpers shared by the serializer and the framework bindings.
 * Everything here is `@internal`: the bindings import these by package name to
 * avoid re-implementing dispatch/read logic per framework, but the surface is
 * not part of the semver-supported public API.
 */

/**
 * Structural check for a `ComarkTree` — an object carrying a `nodes` array.
 * Routes object content to the AST path.
 *
 * @internal
 */
export function isComarkTreeLike(v: unknown): v is ComarkTree {
  return (
    !!v &&
    typeof v === 'object' &&
    'nodes' in (v as Record<string, unknown>) &&
    Array.isArray((v as { nodes: unknown }).nodes)
  )
}

/**
 * Apply a content value with the command matching its flavor. Markdown strings
 * go async (`setComarkMarkdown`); an object with a `'markdown'` flavor falls
 * through to `setContent`, which auto-detects `ComarkTree` vs PM JSON.
 *
 * @internal
 */
export function applyContent(
  editor: Editor,
  value: ContentValue,
  contentType: ContentType,
  options: SetComarkContentOptions = {},
): void {
  const baseOpts = {
    emitUpdate: options.emitUpdate ?? true,
    errorOnInvalidContent: options.errorOnInvalidContent,
  }
  switch (contentType) {
    case 'ast':
      editor.commands.setComarkAst(value as ComarkTree | string, baseOpts)
      return
    case 'markdown':
      if (typeof value === 'string') editor.commands.setComarkMarkdown(value, baseOpts)
      else editor.commands.setContent(value as Content, baseOpts)
      return
    case 'html':
      editor.commands.setContent(value as Content, { ...baseOpts, contentType: 'html' })
      return
    case 'json':
      editor.commands.setContent(value as Content, { ...baseOpts, contentType: 'json' })
      return
  }
}

/**
 * Read the editor's current content in a sync flavor. Markdown is async and
 * returns `null` here — read it via `editor.storage.comark.getMarkdown()`.
 *
 * @internal
 */
export function readByFlavor(editor: Editor, contentType: ContentType): ContentValue | null {
  switch (contentType) {
    case 'ast':
      return editor.storage.comark.getAst()
    case 'html':
      return editor.getHTML()
    case 'json':
      return editor.getJSON() as JSONContent
    case 'markdown':
      return null
  }
}

/**
 * `JSON.stringify` that never throws — the binding shadow guard stamps this to
 * dedupe the model↔editor echo, and a cyclic value must not crash the guard.
 *
 * @internal
 */
export function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}
