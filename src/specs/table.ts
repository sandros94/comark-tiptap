import { hasNoHtmlAttrs, mergeAttrs, splitAttrs } from '../utils/attrs'
import type { ComarkElement, ComarkHelpers, ComarkNode, JSONContent, NodeSpec } from '../types'

// #region table

/** table ↔ Comark `table`; rows are grouped into `thead`/`tbody` on serialize. */
export const tableSpec: NodeSpec = {
  pmName: 'table',
  tags: ['table'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )

    const headerRows: ComarkElement[] = []
    const bodyRows: ComarkElement[] = []
    for (const row of node.content ?? []) {
      if (row.type !== 'tableRow') continue
      const allHeaders =
        (row.content?.length ?? 0) > 0 && (row.content ?? []).every((c) => c.type === 'tableHeader')
      const out = h.serializeBlocks([row])[0] as ComarkElement | undefined
      if (!out) continue
      if (allHeaders) headerRows.push(out)
      else bodyRows.push(out)
    }

    const children: ComarkNode[] = []
    if (headerRows.length > 0) children.push(['thead', {}, ...headerRows])
    if (bodyRows.length > 0) children.push(['tbody', {}, ...bodyRows])
    return ['table', attrs, ...children]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])

    /* Also tolerates a stripped-down `[table, attrs, …rows]` with no thead/tbody. */
    const rows: JSONContent[] = []
    for (const child of children) {
      if (!Array.isArray(child) || child[0] === null) continue
      const tag = child[0] as string
      if (tag === 'thead' || tag === 'tbody') {
        for (const row of child.slice(2) as ComarkNode[]) {
          if (Array.isArray(row) && row[0] === 'tr') {
            const json = h.parseBlocks([row])[0]
            if (json) rows.push(json)
          }
        }
      } else if (tag === 'tr') {
        const json = h.parseBlocks([child])[0]
        if (json) rows.push(json)
      }
    }

    const out: JSONContent = { type: 'table', content: rows }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

// #region tableRow

/** tableRow ↔ Comark `tr`. */
export const tableRowSpec: NodeSpec = {
  pmName: 'tableRow',
  tags: ['tr'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['tr', attrs, ...h.serializeBlocks(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...cells] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const content = cells
      .map((c) => (Array.isArray(c) ? h.parseBlocks([c])[0] : null))
      .filter((c): c is JSONContent => c != null)
    const out: JSONContent = { type: 'tableRow', content }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

// #region tableHeader / tableCell — share the same body

const CELL_SEMANTIC = ['colspan', 'rowspan', 'colwidth', 'align'] as const

function makeCellSpec(pmName: 'tableHeader' | 'tableCell', tag: 'th' | 'td'): NodeSpec {
  return {
    pmName,
    tags: [tag],
    toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
      const semantic: Record<string, unknown> = {}
      const colspan = node.attrs?.colspan
      const rowspan = node.attrs?.rowspan
      const colwidth = node.attrs?.colwidth
      const align = node.attrs?.align
      if (colspan != null && Number(colspan) !== 1) semantic.colspan = Number(colspan)
      if (rowspan != null && Number(rowspan) !== 1) semantic.rowspan = Number(rowspan)
      if (colwidth != null) semantic.colwidth = colwidth
      if (typeof align === 'string' && align.length > 0) semantic.align = align

      const attrs = mergeAttrs(
        semantic,
        (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
      )

      /* A single attrless paragraph flattens to inlines (canonical markdown cell); anything else serializes as blocks. DOM-roundtripped cells (PM-default `htmlAttrs: {}`) still count as attrless. */
      const content = node.content ?? []
      if (content.length === 1 && content[0]?.type === 'paragraph' && hasNoHtmlAttrs(content[0])) {
        return [tag, attrs, ...h.serializeInlines(content[0]?.content)]
      }
      return [tag, attrs, ...h.serializeBlocks(content)]
    },

    fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
      const [, rawAttrs, ...children] = el
      const { semantic, htmlAttrs } = splitAttrs(rawAttrs, CELL_SEMANTIC)

      /* colspan/rowspan default to 1; drop them so the PM JSON stays round-trip-equal with the parser output. */
      const attrs: Record<string, unknown> = {}
      if (semantic.colspan != null && Number(semantic.colspan) !== 1) {
        attrs.colspan = Number(semantic.colspan)
      }
      if (semantic.rowspan != null && Number(semantic.rowspan) !== 1) {
        attrs.rowspan = Number(semantic.rowspan)
      }
      if (semantic.colwidth != null) attrs.colwidth = semantic.colwidth
      if (typeof semantic.align === 'string' && semantic.align.length > 0) {
        attrs.align = semantic.align
      }
      if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs

      /* PM cells need block content: wrap inline runs in a single paragraph, but switch to block mode if a real block child is present. */
      const hasBlock = children.some((c) => Array.isArray(c) && isCellBlockTag(c[0]))
      let content: JSONContent[]
      if (hasBlock) {
        content = h.parseBlocks(children)
      } else {
        const inlines = h.parseInlines(children)
        content =
          inlines.length > 0 ? [{ type: 'paragraph', content: inlines }] : [{ type: 'paragraph' }]
      }

      const out: JSONContent = { type: pmName, content }
      if (Object.keys(attrs).length > 0) out.attrs = attrs
      return out
    },
  }
}

function isCellBlockTag(tag: unknown): boolean {
  if (typeof tag !== 'string') return false
  return (
    tag === 'p' ||
    tag === 'blockquote' ||
    tag === 'ul' ||
    tag === 'ol' ||
    tag === 'pre' ||
    tag === 'hr' ||
    tag === 'table' ||
    tag.match(/^h[1-6]$/) !== null
  )
}

/** tableHeader ↔ Comark `th`. */
export const tableHeaderSpec = makeCellSpec('tableHeader', 'th')
/** tableCell ↔ Comark `td`. */
export const tableCellSpec = makeCellSpec('tableCell', 'td')
