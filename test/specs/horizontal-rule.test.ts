import { describe, expect, it } from 'vitest'
import { createSerializer } from '../../src/serializer'
import type { ComarkElement } from '../../src/types'
import { horizontalRuleSpec } from '../../src/specs/horizontal-rule'

const helpers = createSerializer({ nodes: [horizontalRuleSpec], marks: [] })

describe('horizontalRuleSpec', () => {
  it('round-trips a bare hr', () => {
    const original: ComarkElement = ['hr', {}]
    const pm = horizontalRuleSpec.fromComark(original, helpers)!
    expect(pm).toEqual({ type: 'horizontalRule' })
    expect(horizontalRuleSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves htmlAttrs', () => {
    const original: ComarkElement = ['hr', { class: 'divider', id: 'd1' }]
    const pm = horizontalRuleSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({ htmlAttrs: { class: 'divider', id: 'd1' } })
    expect(horizontalRuleSpec.toComark(pm, helpers)).toEqual(original)
  })
})
