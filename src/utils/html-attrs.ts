import type { Attributes } from '@tiptap/core'

/*
 * DOM attributes PM/Tiptap manages itself, plus namespace prefixes the kit
 * uses for its own discriminator/payload attributes. `data-comark-*` (e.g.
 * `data-comark-comment`, `-template`, `-component`) carry payload or act as
 * parseHTML matchers; harvesting them into `htmlAttrs` would duplicate the
 * value into a separately-rendered field and leak the marker into the AST on
 * round-trip.
 */
const PM_INTERNAL_ATTR_PREFIXES = [
  'data-pm-',
  'data-prosemirror-',
  'pm-',
  'data-node-view-',
  'data-comark-',
] as const

const PM_INTERNAL_ATTR_NAMES = new Set(['contenteditable', 'draggable', 'spellcheck'])

function isInternalAttr(name: string): boolean {
  if (PM_INTERNAL_ATTR_NAMES.has(name)) return true
  for (const prefix of PM_INTERNAL_ATTR_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }
  return false
}

/** Options for {@link htmlAttrSpec}. */
export interface HtmlAttrSpecOptions {
  /**
   * Attributes the type already exposes natively (e.g. `level` on a heading,
   * `start` on an ordered list, `colspan` on a cell). Excluded from the
   * `htmlAttrs` bag so a single value never lives in two places.
   */
  reserved?: readonly string[]
}

/**
 * A Tiptap `addAttributes()` fragment declaring a single `htmlAttrs`
 * attribute. Used by:
 *
 *   1. `ComarkAttrs.addGlobalAttributes` — attaches `htmlAttrs` to every
 *      stock node/mark (paragraph, heading, blockquote, …).
 *   2. `defineComarkComponent` — attaches `htmlAttrs` to user-defined block /
 *      inline components, whose names aren't known when the global config is
 *      built.
 */
export function htmlAttrSpec(options: HtmlAttrSpecOptions = {}): Attributes {
  const reserved = new Set(options.reserved ?? [])
  return {
    htmlAttrs: {
      /*
       * Default to an empty record so consumers can read `htmlAttrs` as
       * `Record<string, unknown>` without a null check. `renderHTML`
       * stringifies primitives and drops non-primitives to avoid emitting
       * `[object Object]` as an HTML attribute.
       */
      default: {} as Record<string, unknown>,
      parseHTML: (el: HTMLElement) => {
        const out: Record<string, string> = {}
        for (const attr of Array.from(el.attributes)) {
          if (reserved.has(attr.name)) continue
          if (isInternalAttr(attr.name)) continue
          out[attr.name] = attr.value
        }
        return Object.keys(out).length > 0 ? out : null
      },
      renderHTML: (attrs: { htmlAttrs?: Record<string, unknown> | null }) => {
        const bag = attrs.htmlAttrs
        if (!bag || typeof bag !== 'object') return {}
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(bag)) {
          if (v === null || v === undefined) continue
          if (typeof v === 'string') {
            out[k] = v
          } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
            out[k] = String(v)
          }
        }
        return out
      },
    },
  }
}
