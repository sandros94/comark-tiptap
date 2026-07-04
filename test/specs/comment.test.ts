import { describe, expect, it } from 'vitest'
import { createSerializer, pmDocToComark } from '../../src/serializer'
import type { ComarkElement, ComarkTree } from '../../src/types'
import { commentSpec } from '../../src/specs/comment'
import { paragraphSpec } from '../../src/specs/paragraph'

const helpers = createSerializer({
  nodes: [paragraphSpec, commentSpec],
  marks: [],
})

describe('commentSpec', () => {
  it('round-trips a comment via the orchestrator', () => {
    const tree: ComarkTree = {
      nodes: [[null, {}, 'TODO: write more here'] as never, ['p', {}, 'After']],
      frontmatter: {},
      meta: {},
    }
    const pm = helpers.parseBlocks(tree.nodes)
    expect(pm[0]).toEqual({
      type: 'comarkComment',
      attrs: { text: 'TODO: write more here' },
    })
    const back = pmDocToComark({ type: 'doc', content: pm }, helpers)
    expect(back.nodes[0]).toEqual([null, {}, 'TODO: write more here'])
    expect(back.nodes[1]).toEqual(['p', {}, 'After'])
  })

  it('preserves attrs on the comment element', () => {
    const result = commentSpec.fromComark(
      [
        null as unknown as string,
        { 'class': 'todo', 'data-x': '1' },
        'note',
      ] as unknown as ComarkElement,
      helpers,
    )
    expect(result).toEqual({
      type: 'comarkComment',
      attrs: { text: 'note', htmlAttrs: { 'class': 'todo', 'data-x': '1' } },
    })
    expect(commentSpec.toComark(result!, helpers)).toEqual([
      null,
      { 'class': 'todo', 'data-x': '1' },
      'note',
    ])
  })
})
