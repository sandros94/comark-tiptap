import { Extension, type GlobalAttributes } from '@tiptap/core'
import { htmlAttrSpec } from './utils/html-attrs'

/*
 * Node/mark types with no reserved keys: their `htmlAttrs` bag captures
 * every HTML attribute not internal to PM/the kit.
 */
const TYPES_NO_RESERVED = [
  // From StarterKit
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'listItem',
  'hardBreak',
  'horizontalRule',
  // Marks (from StarterKit)
  'bold',
  'italic',
  'strike',
  // Comark-specific
  'comarkComment',
] as const

/*
 * Reserved keys per type: attributes the type declares as native, so
 * harvesting them into `htmlAttrs` would duplicate their value.
 */
const RESERVED_BY_TYPE: ReadonlyArray<readonly [readonly string[], readonly string[]]> = [
  // `start`/`type` are native attrs (`type` is read by parseHTML, not rendered as HTML).
  [['orderedList'], ['start', 'type']],
  // Link declares href/title/target/rel/class as native attrs.
  [['link'], ['href', 'title', 'target', 'rel', 'class']],
  [['code'], []],
  /*
   * Reserve only `language`: it maps to the inner `<code>`'s class, so
   * `class` on the outer `<pre>` still flows through htmlAttrs.
   */
  [['codeBlock'], ['language']],
  // Image native attrs: src/alt/title/width/height.
  [['image'], ['src', 'alt', 'title', 'width', 'height']],
  // Cell/header native attrs: colspan/rowspan/colwidth/align.
  [
    ['tableCell', 'tableHeader'],
    ['colspan', 'rowspan', 'colwidth', 'align'],
  ],
  /*
   * Reserve `style`: TableKit's renderHTML auto-injects a computed
   * `min-width`/`width` that would otherwise be baked into the AST.
   */
  [['table'], ['style']],
  [['tableRow'], []],
  // ComarkTemplate native attr: `name` (slot name).
  [['comarkTemplate'], ['name']],
]

/**
 * Declares the global `htmlAttrs` attribute on every stock node and mark
 * Comark handles.
 *
 * @remarks
 * User-defined components (from {@link defineComarkComponent}) declare
 * their own `htmlAttrs` in `addAttributes`, since their type names aren't
 * known when global attributes resolve.
 */
export const ComarkAttrs = Extension.create({
  name: 'comarkAttrs',

  addGlobalAttributes(): GlobalAttributes {
    const groups: GlobalAttributes = [
      // No reserved keys: every non-internal HTML attr lands in htmlAttrs.
      {
        types: [...TYPES_NO_RESERVED],
        attributes: { ...htmlAttrSpec() },
      },
    ]
    for (const [types, reserved] of RESERVED_BY_TYPE) {
      groups.push({
        types: [...types],
        attributes: { ...htmlAttrSpec({ reserved }) },
      })
    }
    return groups
  },
})
