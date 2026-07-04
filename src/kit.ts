import { Extension, type Extensions } from '@tiptap/core'
import { Image, type ImageOptions } from '@tiptap/extension-image'
import { TableKit, type TableKitOptions } from '@tiptap/extension-table'
import { StarterKit, type StarterKitOptions } from '@tiptap/starter-kit'
import { ComarkAttrs } from './attrs'
import { ComarkCodeBlock } from './extensions/code-block'
import { ComarkComment } from './extensions/comment'
import { type ComarkComponentExports, defineComarkComponent } from './extensions/component'
import { ComarkTemplate } from './extensions/template'
import { ComarkSerializer, type ComarkSerializerOptions } from './serializer'
import { comarkSpecs } from './specs'

export interface ComarkKitOptions {
  /**
   * Forwarded to `StarterKit.configure(...)`. Disable or tweak individual
   * stock extensions, e.g. `{ heading: false }` or
   * `{ heading: { levels: [1, 2, 3] } }`. Pass `false` to omit StarterKit
   * (and {@link ComarkCodeBlock}) entirely.
   *
   * @remarks
   * The kit forces `codeBlock: false` (replaced by {@link ComarkCodeBlock})
   * and `underline: false` regardless of what you pass; your config layers
   * on top, so re-enable either explicitly if needed.
   * @default {}
   */
  starterKit: Partial<StarterKitOptions> | false

  /**
   * Forwarded to `TableKit.configure(...)`. Pass `false` to omit tables.
   * @default {}
   */
  table: Partial<TableKitOptions> | false

  /**
   * Forwarded to `Image.configure(...)`. Pass `false` to omit images.
   * @default {}
   */
  image: Partial<ImageOptions> | false

  /**
   * User-defined components from {@link defineComarkComponent}; each entry
   * contributes a Tiptap node extension and a serialization spec.
   * @default []
   */
  components: ReadonlyArray<ComarkComponentExports>

  /**
   * Forwarded to `ComarkSerializer.configure(...)`. Only `injectStyles` and
   * `injectNonce` are exposed; the kit supplies `specs` itself. Pass just
   * the field you want to override.
   * @default { injectStyles: true, injectNonce: undefined }
   */
  serializer: Partial<Pick<ComarkSerializerOptions, 'injectStyles' | 'injectNonce'>>

  /**
   * Enables the comment extension (`<!-- … -->`). Pass `false` to omit it;
   * comment AST nodes from `setComarkAst` are then dropped silently.
   * @default {}
   */
  comment: false | Record<string, never>

  /**
   * Enables the template extension (`::template[name]`). Pass `false` to
   * omit it.
   * @default {}
   */
  template: false | Record<string, never>
}

/**
 * A single Tiptap extension that assembles the full Comark stack:
 * StarterKit, the Table cluster, Image, the comark-specific nodes, the
 * global `htmlAttrs` declaration, the serializer, and any user-defined
 * components.
 *
 * @example
 * ```ts
 * import { ComarkKit, defineComarkComponent } from 'comark-tiptap'
 *
 * const Alert = defineComarkComponent({ name: 'alert', kind: 'block' })
 *
 * new Editor({
 *   extensions: [ComarkKit.configure({ components: [Alert] })],
 *   content: '# Hi',
 * })
 * ```
 */
export const ComarkKit = Extension.create<ComarkKitOptions>({
  name: 'comarkKit',

  addOptions(): ComarkKitOptions {
    return {
      starterKit: {},
      table: {},
      image: {},
      components: [],
      serializer: { injectStyles: true, injectNonce: undefined },
      comment: {},
      template: {},
    }
  },

  addExtensions(): Extensions {
    const exts: Extensions = []

    /*
     * Force codeBlock/underline off regardless of consumer config;
     * ComarkCodeBlock replaces the stock CodeBlock. Both are skipped when
     * starterKit is false.
     */
    if (this.options.starterKit !== false) {
      exts.push(
        StarterKit.configure({
          codeBlock: false,
          underline: false,
          ...this.options.starterKit,
        }),
        ComarkCodeBlock,
      )
    }

    if (this.options.table !== false) {
      exts.push(TableKit.configure(this.options.table))
    }
    if (this.options.image !== false) {
      // Comark images are always inline; pass `inline: false` for block images.
      exts.push(Image.configure({ inline: true, ...this.options.image }))
    }
    if (this.options.comment !== false) {
      exts.push(ComarkComment)
    }
    if (this.options.template !== false) {
      exts.push(ComarkTemplate)
    }

    // Global `htmlAttrs` for every stock node and mark.
    exts.push(ComarkAttrs)

    // Each component adds its node extension here; its spec is collected below.
    for (const c of this.options.components) {
      exts.push(c.extension)
    }

    // Pushed last so it sees every contributed extension.
    exts.push(
      ComarkSerializer.configure({
        specs: {
          nodes: [...comarkSpecs.nodes, ...this.options.components.map((c) => c.spec)],
          marks: comarkSpecs.marks,
        },
        injectStyles: this.options.serializer?.injectStyles ?? true,
        injectNonce: this.options.serializer?.injectNonce,
      }),
    )

    return exts
  },
})

/** Re-exported for assembling extensions by hand, without `ComarkKit`. */
export { defineComarkComponent }
