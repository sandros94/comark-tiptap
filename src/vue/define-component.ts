import { VueNodeViewRenderer } from "@tiptap/vue-3";
import {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
} from "comark-tiptap";
import type { Component } from "vue";

/**
 * Vue-typed `ComarkComponentDefinition`. The `nodeView` field is
 * narrowed to a Vue SFC / functional component; receives Tiptap's
 * standard NodeView props (`node`, `updateAttributes`, `editor`, …) at
 * runtime.
 */
export type ComarkVueComponentDefinition = ComarkComponentDefinition<Component>;

/**
 * Vue-typed `ComarkComponentExports`. Structurally identical to the
 * framework-agnostic `ComarkComponentExports<Component>`, but the
 * runtime `extension` returned from `defineComarkVueComponent` has
 * `addNodeView` extended with a `VueNodeViewRenderer` when a `nodeView`
 * was provided.
 */
export type ComarkVueComponentExports = ComarkComponentExports<Component>;

/**
 * Define a Comark component with an optional Vue NodeView. Wraps the
 * framework-agnostic `defineComarkComponent`; when `def.nodeView` is
 * set, the returned `extension` renders it via `VueNodeViewRenderer`.
 *
 * @param def - The component definition. See
 * {@link ComarkVueComponentDefinition}.
 * @returns Exports (schema, serialization `spec`, `extension`) to pass in
 * the `components` option of `useComarkEditor` / `<ComarkEditor>`. See
 * {@link ComarkVueComponentExports}.
 *
 * @example
 * ```ts
 * import AlertView from './Alert.vue'
 *
 * const AlertComponent = defineComarkVueComponent({
 *   name: 'alert',
 *   kind: 'block',
 *   props: { type: { type: 'string', default: 'info' } },
 *   nodeView: AlertView,
 * })
 * ```
 */
export function defineComarkVueComponent(
  def: ComarkVueComponentDefinition,
): ComarkVueComponentExports {
  /*
   * Build the framework-agnostic part first (schema + serialization
   * spec), then extend its Tiptap Node with `addNodeView` so the Vue SFC
   * takes over rendering.
   */
  const base = defineComarkComponent<Component>(def);

  if (!def.nodeView) return base;

  const nodeView = def.nodeView;
  const extension = base.extension.extend({
    addNodeView() {
      return VueNodeViewRenderer(nodeView);
    },
  });

  return { ...base, extension };
}
