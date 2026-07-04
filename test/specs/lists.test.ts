import { describe, expect, it } from 'vitest'
import { boldSpec } from '../../src/specs/marks'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { bulletListSpec, listItemSpec, orderedListSpec } from '../../src/specs/lists'
import { paragraphSpec } from '../../src/specs/paragraph'

const helpers = createSerializer({
  nodes: [paragraphSpec, listItemSpec, bulletListSpec, orderedListSpec],
  marks: [boldSpec],
})

describe('bulletListSpec', () => {
  it('round-trips a flat bullet list with single-paragraph items', () => {
    const original: ComarkElement = ['ul', {}, ['li', {}, 'one'], ['li', {}, 'two']]
    const pm = bulletListSpec.fromComark(original, helpers)!
    expect(pm).toEqual({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
        },
      ],
    })
    expect(bulletListSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves htmlAttrs on the ul', () => {
    const original: ComarkElement = ['ul', { class: 'task-list' }, ['li', {}, 'x']]
    const pm = bulletListSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({ htmlAttrs: { class: 'task-list' } })
    expect(bulletListSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('round-trips items with inline marks (bold)', () => {
    const original: ComarkElement = [
      'ul',
      {},
      ['li', {}, 'a ', ['strong', { class: 'k' }, 'B'], ' c'],
    ]
    const pm = bulletListSpec.fromComark(original, helpers)!
    expect(bulletListSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('seeds one empty item for a childless list (`- ` alone is invalid PM otherwise)', () => {
    // `parse('- \n')` yields `['ul', {}]`; PM's `listItem+` schema rejects an
    // empty list, so we synthesize a single empty item.
    const pm = bulletListSpec.fromComark(['ul', {}] as ComarkElement, helpers)!
    expect(pm.content).toEqual([{ type: 'listItem', content: [{ type: 'paragraph' }] }])
  })
})

describe('orderedListSpec', () => {
  it('coerces `start` to a number for PM (Comark carries it as a string)', () => {
    const original: ComarkElement = ['ol', { start: '5' }, ['li', {}, 'a']]
    const pm = orderedListSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({ start: 5 })
    expect(orderedListSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('omits `start` when it is 1 (the implicit default)', () => {
    const pm = orderedListSpec.fromComark(['ol', {}, ['li', {}, 'x']] as ComarkElement, helpers)!
    expect(pm.attrs?.start).toBeUndefined()
    const back = orderedListSpec.toComark(pm, helpers)
    expect(back).toEqual(['ol', {}, ['li', {}, 'x']])
  })

  it('preserves both `start` and htmlAttrs', () => {
    const original: ComarkElement = ['ol', { start: '3', class: 'numbered' }, ['li', {}, 'a']]
    const pm = orderedListSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({ start: 3, htmlAttrs: { class: 'numbered' } })
    expect(orderedListSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('seeds one empty item for a childless ordered list', () => {
    const pm = orderedListSpec.fromComark(['ol', {}] as ComarkElement, helpers)!
    expect(pm.content).toEqual([{ type: 'listItem', content: [{ type: 'paragraph' }] }])
  })
})

describe('listItemSpec', () => {
  it('flattens a single-paragraph item to inlines on the way out', () => {
    const pm = {
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
    }
    expect(listItemSpec.toComark(pm, helpers)).toEqual(['li', {}, 'x'])
  })

  it('keeps multi-block items as nested blocks', () => {
    const pm = {
      type: 'listItem',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ],
    }
    expect(listItemSpec.toComark(pm, helpers)).toEqual([
      'li',
      {},
      ['p', {}, 'one'],
      ['p', {}, 'two'],
    ])
  })

  it('keeps the paragraph wrap when the inner paragraph carries htmlAttrs', () => {
    // Otherwise we'd lose those attrs on the way out.
    const pm = {
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          attrs: { htmlAttrs: { class: 'lead' } },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    }
    expect(listItemSpec.toComark(pm, helpers)).toEqual(['li', {}, ['p', { class: 'lead' }, 'x']])
  })
})
