import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../../src/specs/paragraph'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { tableCellSpec, tableHeaderSpec, tableRowSpec, tableSpec } from '../../src/specs/table'

const helpers = createSerializer({
  nodes: [paragraphSpec, tableSpec, tableRowSpec, tableHeaderSpec, tableCellSpec],
  marks: [],
})

describe('table round-trip', () => {
  it('round-trips a basic GFM table with header + body', () => {
    const original: ComarkElement = [
      'table',
      {},
      ['thead', {}, ['tr', {}, ['th', {}, 'A'], ['th', {}, 'B']]],
      ['tbody', {}, ['tr', {}, ['td', {}, '1'], ['td', {}, '2']]],
    ]
    const pm = tableSpec.fromComark(original, helpers)!
    expect(pm).toMatchObject({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph' }] },
            { type: 'tableHeader', content: [{ type: 'paragraph' }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
            { type: 'tableCell', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    })
    expect(tableSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves alignment as a native cell attr (stock Tiptap TableCell declares align)', () => {
    const original: ComarkElement = [
      'table',
      {},
      ['tbody', {}, ['tr', {}, ['td', { align: 'right' }, 'X'], ['td', { align: 'center' }, 'Y']]],
    ]
    const pm = tableSpec.fromComark(original, helpers)!
    expect(pm.content?.[0]?.content?.[0]?.attrs).toEqual({ align: 'right' })
    expect(pm.content?.[0]?.content?.[1]?.attrs).toEqual({ align: 'center' })
    expect(tableSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves colspan/rowspan as semantic attrs', () => {
    const original: ComarkElement = [
      'table',
      {},
      ['tbody', {}, ['tr', {}, ['td', { colspan: 2 }, 'merged'], ['td', { rowspan: 3 }, 'tall']]],
    ]
    const pm = tableSpec.fromComark(original, helpers)!
    const cells = pm.content?.[0]?.content ?? []
    expect(cells[0]?.attrs).toEqual({ colspan: 2 })
    expect(cells[1]?.attrs).toEqual({ rowspan: 3 })
    expect(tableSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('drops `colspan: 1` / `rowspan: 1` (the implicit defaults)', () => {
    const pm = tableSpec.fromComark(
      [
        'table',
        {},
        ['tbody', {}, ['tr', {}, ['td', { colspan: 1, rowspan: 1 }, 'x']]],
      ] as ComarkElement,
      helpers,
    )!
    expect(pm.content?.[0]?.content?.[0]?.attrs).toBeUndefined()
  })

  it('preserves htmlAttrs on the table itself', () => {
    const original: ComarkElement = [
      'table',
      { 'class': 'striped', 'data-sortable': 'true' },
      ['tbody', {}, ['tr', {}, ['td', {}, 'x']]],
    ]
    const pm = tableSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({
      htmlAttrs: { 'class': 'striped', 'data-sortable': 'true' },
    })
    expect(tableSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('regroups rows into thead/tbody on the way back out', () => {
    // The PM shape has rows flat; the spec must reconstruct thead/tbody.
    const pm = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableHeader', content: [{ type: 'paragraph' }] }],
        },
        {
          type: 'tableRow',
          content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
        },
      ],
    }
    const out = tableSpec.toComark(pm, helpers) as ComarkElement
    expect(out[2]?.[0]).toBe('thead')
    expect(out[3]?.[0]).toBe('tbody')
  })

  it('keeps row order when a header row is not first (no silent reordering)', () => {
    // Rows body/header/body: the middle header must NOT jump to <thead>. Only a
    // leading run of header rows becomes <thead>; here there is none, so every
    // row stays in <tbody> in source order (the header cell stays a th).
    const row = (tag: 'tableCell' | 'tableHeader') => ({
      type: 'tableRow',
      content: [{ type: tag, content: [{ type: 'paragraph' }] }],
    })
    const pm = { type: 'table', content: [row('tableCell'), row('tableHeader'), row('tableCell')] }
    expect(tableSpec.toComark(pm, helpers)).toEqual([
      'table',
      {},
      ['tbody', {}, ['tr', {}, ['td', {}]], ['tr', {}, ['th', {}]], ['tr', {}, ['td', {}]]],
    ])
  })

  it('seeds a minimal cell for a rowless table (invalid PM otherwise)', () => {
    const pm = tableSpec.fromComark(['table', {}] as ComarkElement, helpers)!
    expect(pm.content).toEqual([
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] },
    ])
  })

  it('coerces a stringy colwidth into a number array', () => {
    const pm = tableSpec.fromComark(
      [
        'table',
        {},
        ['tbody', {}, ['tr', {}, ['td', { colwidth: ['80', '120'] }, 'x']]],
      ] as ComarkElement,
      helpers,
    )!
    expect(pm.content?.[0]?.content?.[0]?.attrs?.colwidth).toEqual([80, 120])
  })
})
