/**
 * @vitest-environment happy-dom
 *
 * Coverage for the Vue `<ComarkEditor>` component and
 * `defineComarkVueComponent` — the wrapper's v-model surface (emit + the
 * outside-in watcher), the modifier-driven output flavor, the echo-loop
 * guard, the default slot, and NodeView wiring.
 *
 * As in `use-comark-editor.test.ts` we mount by hand with `createApp`
 * (no `@vue/test-utils` dep). A stable function ref captures the
 * component's `expose()` proxy so tests can reach the live editor.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  shallowRef,
  type ShallowRef,
  type VNode,
} from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/vue-3'
import type { ComarkTree, ContentType, ContentValue, JSONContent } from 'comark-tiptap'
import {
  ComarkEditor,
  defineComarkVueComponent,
  type ComarkEditorExpose,
} from '../../src/vue/index'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/* `h()` against `<ComarkEditor>`'s full prop type trips TS2589 (excessively
   deep instantiation) in this test's dynamic-props shape; a loose signature
   sidesteps overload resolution without changing runtime behavior. */
const hLoose = h as (type: unknown, props: unknown, children?: unknown) => VNode

interface MountOptions {
  initial?: ContentValue
  modifiers?: Record<string, boolean>
  contentType?: ContentType
  content?: ContentValue
  components?: ReadonlyArray<ReturnType<typeof defineComarkVueComponent>>
  withModel?: boolean
  slots?: boolean
}

interface Mounted {
  /* Narrowed to what the tests use — the full `App` type trips TS2589 here. */
  app: { unmount(): void }
  container: HTMLElement
  model: ShallowRef<ContentValue | undefined>
  editor: () => Editor | undefined
  updates: () => number
  slotSawEditor: () => boolean
}

function mount(options: MountOptions): Mounted {
  /* shallowRef, not ref: the deep `JSONContent` union in ContentValue makes
     Vue's UnwrapRef recurse (TS2589). We only ever replace `.value` wholesale. */
  const model = shallowRef<ContentValue | undefined>(options.initial)
  const exposeRef = shallowRef<ComarkEditorExpose | null>(null)
  const setExpose = (el: unknown): void => {
    exposeRef.value = el as ComarkEditorExpose | null
  }
  let updateCount = 0
  let slotSaw = false

  const Host = defineComponent({
    setup() {
      return () => {
        const props: Record<string, unknown> = {
          ref: setExpose,
          onUpdate: () => {
            updateCount++
          },
        }
        if (options.withModel !== false) {
          props.modelValue = model.value
          props['onUpdate:modelValue'] = (v: ContentValue) => {
            model.value = v
          }
          props.modelModifiers = options.modifiers ?? {}
        }
        if (options.content !== undefined) props.content = options.content
        if (options.contentType) props.contentType = options.contentType
        if (options.components) props.components = options.components

        const slots = options.slots
          ? {
              default: ({ editor }: { editor: Editor }) => {
                slotSaw = !!editor
                return h('div', { 'data-test': 'toolbar' }, editor ? 'ready' : 'no')
              },
            }
          : undefined
        return hLoose(ComarkEditor, props, slots)
      }
    },
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(Host)
  app.mount(container)
  return {
    app,
    container,
    model,
    editor: (): Editor | undefined => exposeRef.value?.editor,
    updates: (): number => updateCount,
    slotSawEditor: (): boolean => slotSaw,
  }
}

const live: Mounted[] = []
beforeEach(() => {
  live.length = 0
})
afterEach(() => {
  while (live.length) {
    const m = live.pop()!
    m.app.unmount()
    m.container.remove()
  }
})

async function readyEditor(m: Mounted, timeoutMs = 1000): Promise<Editor> {
  const start = Date.now()
  while (!m.editor()) {
    if (Date.now() - start > timeoutMs) throw new Error('editor never became ready')
    await flush()
  }
  return m.editor()!
}

describe('<ComarkEditor> (Vue, v-model)', () => {
  it('emits update:modelValue in markdown when the editor is edited', async () => {
    const m = mount({ initial: '# A', modifiers: { markdown: true } })
    live.push(m)
    const editor = await readyEditor(m)
    await flush() // async markdown seed lands

    editor.commands.setComarkMarkdown('# Changed')
    await flush()
    await flush()
    expect(typeof m.model.value).toBe('string')
    expect(m.model.value as string).toContain('# Changed')
  })

  it('pushes an outside-in model change into the editor (markdown)', async () => {
    const m = mount({ initial: '# A', modifiers: { markdown: true } })
    live.push(m)
    const editor = await readyEditor(m)
    await flush()

    m.model.value = '## Outside In'
    await nextTick()
    await flush()
    expect(editor.getText()).toContain('Outside In')
  })

  it('round-trips the json flavor via v-model.json', async () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'json me' }] }],
    }
    const m = mount({ initial: doc, modifiers: { json: true } })
    live.push(m)
    const editor = await readyEditor(m)
    await flush()
    expect(editor.getText()).toContain('json me')

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' more')
    await flush()
    expect(typeof m.model.value).toBe('object')
    expect(JSON.stringify(m.model.value)).toContain('json me')
  })

  it('round-trips the ast flavor via v-model.ast', async () => {
    const tree: ComarkTree = { nodes: [['p', {}, 'ast me']], frontmatter: {}, meta: {} }
    const m = mount({ initial: tree, modifiers: { ast: true } })
    live.push(m)
    const editor = await readyEditor(m)
    await flush()
    expect(editor.getText()).toContain('ast me')
  })

  it('does not echo an emitted value back into a re-apply loop', async () => {
    const m = mount({ initial: '# A', modifiers: { markdown: true } })
    live.push(m)
    const editor = await readyEditor(m)
    await flush()

    editor.commands.setComarkMarkdown('# Once')
    await flush()
    await flush()
    const settled = m.updates()

    // The emit round-trips through the model; the shadow guard must stop the
    // watcher from re-applying it and triggering another update.
    await flush()
    await flush()
    expect(m.updates()).toBe(settled)
  })

  it('renders the default slot with the live editor', async () => {
    const m = mount({ initial: '# A', modifiers: { markdown: true }, slots: true })
    live.push(m)
    await readyEditor(m)
    await nextTick()
    expect(m.slotSawEditor()).toBe(true)
    expect(m.container.querySelector('[data-test="toolbar"]')?.textContent).toBe('ready')
  })

  it('seeds a non-reactive :content without v-model', async () => {
    const m = mount({ content: '# Seeded', contentType: 'markdown', withModel: false })
    live.push(m)
    const editor = await readyEditor(m)
    await flush()
    expect(editor.getText()).toContain('Seeded')
  })
})

describe('defineComarkVueComponent', () => {
  it('wires a Vue NodeView onto the extension only when nodeView is provided', () => {
    const View = defineComponent({ render: () => null })
    const withView = defineComarkVueComponent({
      name: 'alert',
      kind: 'block',
      props: { type: { type: 'string', default: 'info' } },
      nodeView: View,
    })
    const withoutView = defineComarkVueComponent({ name: 'plain', kind: 'block' })

    expect(withView.spec.pmName).toBe('alert')
    expect(withView.definition.name).toBe('alert')
    expect(typeof withView.extension.config.addNodeView).toBe('function')
    expect(withoutView.extension.config.addNodeView).toBeUndefined()
  })

  it('renders the NodeView inside a live editor', async () => {
    const AlertView = defineComponent({
      setup() {
        return () => h(NodeViewWrapper, { 'data-test': 'alert-view' }, () => 'ALERT')
      },
    })
    const Alert = defineComarkVueComponent({ name: 'alert', kind: 'block', nodeView: AlertView })
    const tree: ComarkTree = { nodes: [['alert', {}, ['p', {}, 'x']]], frontmatter: {}, meta: {} }
    const m = mount({ initial: tree, modifiers: { ast: true }, components: [Alert] })
    live.push(m)
    await readyEditor(m)

    const start = Date.now()
    while (!m.container.querySelector('[data-test="alert-view"]')) {
      if (Date.now() - start > 1000) throw new Error('NodeView never rendered')
      await flush()
    }
    expect(m.container.querySelector('[data-test="alert-view"]')?.textContent).toContain('ALERT')
  })
})
