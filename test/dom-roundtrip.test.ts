/**
 * @vitest-environment happy-dom
 */

import {
  generateHTML,
  generateJSON,
  type AnyExtension,
  type JSONContent as TipJSONContent,
} from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { defineComarkComponent } from '../src/extensions/component'
import { ComarkKit } from '../src/kit'
import { comarkToPmDoc, createSerializer, pmDocToComark } from '../src/serializer'
import { comarkSpecs } from '../src/specs'
import type { ComarkHelpers, ComarkNode, ComarkTree } from '../src/types'

// #region internal helpers

const baseHelpers = createSerializer(comarkSpecs)

/**
 * Strip Comark's `$` source-position bag and any other parser
 * bookkeeping that tests don't care about. Both directions of the
 * round-trip should produce trees comparable up to this scrub.
 */
function cleanTree(tree: ComarkTree): ComarkTree {
  return {
    nodes: tree.nodes.map(cleanNode),
    frontmatter: { ...tree.frontmatter },
    meta: {},
  }
}
function cleanNode(node: ComarkNode): ComarkNode {
  if (typeof node === 'string') return node
  if (!Array.isArray(node)) return node
  const [tag, attrs, ...children] = node
  const cleanAttrs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === '$') continue
    cleanAttrs[k] = v
  }
  return [tag, cleanAttrs, ...children.map((c) => cleanNode(c as ComarkNode))] as ComarkNode
}

const defaultExtensions: AnyExtension[] = [ComarkKit]

/**
 * The full DOM round-trip: tree → PM JSON → HTML → PM JSON → tree.
 * Both ends are scrubbed before comparison.
 */
function domRoundTrip(
  tree: ComarkTree,
  extensions: AnyExtension[] = defaultExtensions,
  helpers: ComarkHelpers = baseHelpers,
): ComarkTree {
  const pmIn = comarkToPmDoc(tree, helpers)
  const html = generateHTML(pmIn, extensions)
  const pmOut = generateJSON(html, extensions) as TipJSONContent
  return pmDocToComark(pmOut, helpers)
}

// #region per-node coverage

describe('DOM round-trip — block nodes', () => {
  it.each<[string, ComarkTree]>([
    [
      'paragraph with htmlAttrs',
      {
        nodes: [['p', { 'class': 'lead', 'data-x': 'y' }, 'Hello']],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'heading h2 with id and class (markdown {#anchor .foo} round-trip)',
      {
        nodes: [['h2', { 'id': 'top', 'class': 'big', 'data-section': 'intro' }, 'Title']],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'heading at every level',
      {
        nodes: [
          ['h1', {}, 'one'],
          ['h2', {}, 'two'],
          ['h3', {}, 'three'],
          ['h4', {}, 'four'],
          ['h5', {}, 'five'],
          ['h6', {}, 'six'],
        ],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'blockquote with multi-paragraph body and html attrs',
      {
        nodes: [
          [
            'blockquote',
            { 'class': 'note', 'data-cite': 'rfc' },
            ['p', {}, 'first'],
            ['p', {}, 'second'],
          ],
        ],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'horizontal rule with html attrs',
      {
        nodes: [['hr', { 'class': 'separator', 'data-tag': 'sep' }]],
        frontmatter: {},
        meta: {},
      },
    ],
  ])('%s', (_label, tree) => {
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

describe('DOM round-trip — code block', () => {
  // Canonical Comark form: `language` lives on the outer `<pre>` AND
  // the inner `<code>` carries `class="language-{lang}"` (the Comark
  // parser emits both). `filename`, `highlights`, `meta` aren't rendered
  // through DOM (they're PM-side attrs only) so they wouldn't survive a
  // generateHTML/generateJSON pass — those are covered by the
  // spec-only test in [code-block.test.ts].
  it('preserves the canonical pre+code shape with outer html attrs', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'pre',
          { 'language': 'ts', 'class': 'wrap', 'data-section': 'demo' },
          ['code', { class: 'language-ts' }, 'const x = 1\n'],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  // Inner-code attrs other than `language-{lang}` ride on
  // `codeHtmlAttrs` and have to be emitted by the codeBlock's own
  // renderHTML — the per-attribute renderHTML can't reach the inner
  // element. This test pins that down so a future refactor can't
  // silently drop the feature.
  it('preserves extra inner-<code> attributes (e.g. data-line-numbers)', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'pre',
          { language: 'ts' },
          ['code', { 'class': 'language-ts', 'data-line-numbers': 'true' }, 'x\n'],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

describe('DOM round-trip — image (inline atom)', () => {
  it('preserves src/alt/title plus extra html attrs', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'p',
          {},
          [
            'img',
            {
              'src': '/x.png',
              'alt': 'A',
              'title': 'T',
              'width': '320',
              'class': 'rounded',
              'data-id': 'hero',
            },
          ],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

describe('DOM round-trip — hardBreak', () => {
  it('round-trips a bare <br>', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, 'a', ['br', {}], 'b']],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('preserves htmlAttrs on a <br>', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, 'a', ['br', { 'aria-hidden': 'true', 'class': 'soft' }], 'b']],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

describe('DOM round-trip — comment node', () => {
  it('preserves a non-empty comment text', () => {
    const tree: ComarkTree = {
      nodes: [[null, {}, 'TODO: write more here'] as never, ['p', {}, 'After']],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('preserves htmlAttrs alongside the text', () => {
    const tree: ComarkTree = {
      nodes: [[null, { 'class': 'todo', 'data-priority': 'high' }, 'review later'] as never],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

// #region lists

describe('DOM round-trip — lists', () => {
  it('round-trips a bullet list with single-paragraph items', () => {
    const tree: ComarkTree = {
      nodes: [['ul', {}, ['li', {}, 'one'], ['li', {}, 'two'], ['li', {}, 'three']]],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('round-trips an ordered list with `start` preserved', () => {
    const tree: ComarkTree = {
      nodes: [['ol', { start: '5' }, ['li', {}, 'a'], ['li', {}, 'b']]],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('round-trips nested bullet lists', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'ul',
          {},
          ['li', {}, 'a'],
          // An item with a following nested list keeps its paragraph wrapper
          // (Comark's canonical form); single-child items stay flattened.
          ['li', {}, ['p', {}, 'b'], ['ul', {}, ['li', {}, 'b.1'], ['li', {}, 'b.2']]],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('preserves htmlAttrs on the ul and on individual li', () => {
    const tree: ComarkTree = {
      nodes: [
        ['ul', { class: 'task-list' }, ['li', { 'data-done': 'true' }, 'a'], ['li', {}, 'b']],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

// #region tables

describe('DOM round-trip — tables', () => {
  // Canonical GFM-style table — the only shape Comark's parser produces
  // from markdown. colspan/rowspan/colwidth aren't emitted by the parser
  // and are covered by the spec-level [table.test.ts] tests instead.
  it('round-trips a header + body table with thead/tbody regrouping', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'table',
          {},
          ['thead', {}, ['tr', {}, ['th', {}, 'A'], ['th', {}, 'B']]],
          ['tbody', {}, ['tr', {}, ['td', {}, '1'], ['td', {}, '2']]],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

// #region marks

describe('DOM round-trip — marks', () => {
  it.each<[string, ComarkTree]>([
    [
      'bold',
      {
        nodes: [['p', {}, 'a ', ['strong', {}, 'B'], ' c']],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'bold with class (the canonical "first-class htmlAttrs on a mark" case)',
      {
        nodes: [['p', {}, 'a ', ['strong', { 'class': 'k', 'data-y': '1' }, 'B'], ' c']],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'italic (canonicalized to <em>)',
      {
        nodes: [['p', {}, ['em', {}, 'i']]],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'strike (canonicalized to <del>)',
      {
        nodes: [['p', {}, ['del', { class: 'gone' }, 's']]],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'inline code with html attrs',
      {
        nodes: [['p', {}, ['code', { class: 'lang-bash' }, 'ls']]],
        frontmatter: {},
        meta: {},
      },
    ],
    [
      'link with target/rel + title (semantic + htmlAttrs split)',
      {
        nodes: [
          ['p', {}, ['a', { href: '/x', title: 'T', target: '_blank', rel: 'noopener' }, 'go']],
        ],
        frontmatter: {},
        meta: {},
      },
    ],
  ])('%s', (_label, tree) => {
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })

  it('layered marks (bold around italic) round-trip both layers', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, ['strong', {}, ['em', {}, 'BI']]]],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

// #region mark adjacency

describe('DOM round-trip — adjacent same-mark spans', () => {
  // Two adjacent `<strong>X</strong><strong>Y</strong>` in source HTML
  // should collapse to a single PM mark on a single text node, then
  // re-emit as one `<strong>` span. We round-trip via the orchestrator,
  // so what matters is that the final tree is *equivalent*.
  it('collapses two attrless <strong> runs into one on the way back', () => {
    const start: ComarkTree = {
      nodes: [['p', {}, ['strong', {}, 'X'], ['strong', {}, 'Y']]],
      frontmatter: {},
      meta: {},
    }
    const expected: ComarkTree = {
      nodes: [['p', {}, ['strong', {}, 'XY']]],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(start))).toEqual(cleanTree(expected))
  })

  // Same mark, different `htmlAttrs` → must NOT collapse, otherwise
  // class/id/data-* differences silently merge.
  it('keeps two same-mark runs separate when htmlAttrs differ', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, ['strong', { class: 'a' }, 'X'], ['strong', { class: 'b' }, 'Y']]],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree))).toEqual(cleanTree(tree))
  })
})

// #region custom components — block + inline

describe('DOM round-trip — custom components', () => {
  const Alert = defineComarkComponent({
    name: 'alert',
    kind: 'block',
    props: {
      type: { type: 'string', default: 'info' },
      title: { type: 'string' },
    },
  })
  const Badge = defineComarkComponent({
    name: 'badge',
    kind: 'inline',
    props: { color: { type: 'string', default: 'gray' } },
  })

  const extensions: AnyExtension[] = [ComarkKit.configure({ components: [Alert, Badge] })]
  const helpers = createSerializer({
    nodes: [...comarkSpecs.nodes, Alert.spec, Badge.spec],
    marks: comarkSpecs.marks,
  })

  it('round-trips a block component with declared props + extra htmlAttrs', () => {
    const tree: ComarkTree = {
      nodes: [
        ['alert', { type: 'warning', title: 'Heads up', class: 'ring' }, 'Body **text** here.'],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree, extensions, helpers))).toEqual(cleanTree(tree))
  })

  it('round-trips an inline component nested in a paragraph', () => {
    const tree: ComarkTree = {
      nodes: [['p', {}, 'Status: ', ['badge', { color: 'green' }, 'New'], '.']],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree, extensions, helpers))).toEqual(cleanTree(tree))
  })

  it('round-trips an inline component INSIDE a list item (lists.ts block element regression)', () => {
    const tree: ComarkTree = {
      nodes: [
        [
          'ul',
          {},
          ['li', {}, 'pre ', ['badge', { color: 'green' }, 'New'], ' post'],
          ['li', {}, 'plain'],
        ],
      ],
      frontmatter: {},
      meta: {},
    }
    expect(cleanTree(domRoundTrip(tree, extensions, helpers))).toEqual(cleanTree(tree))
  })
})
