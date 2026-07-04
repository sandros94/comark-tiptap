import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
} from "comark-tiptap";
import type { ComponentType } from "react";

/** A React NodeView component, receiving Tiptap's `ReactNodeViewProps`. */
export type ComarkReactNodeView = ComponentType<ReactNodeViewProps>;

/** {@link ComarkComponentDefinition} with `nodeView` narrowed to a React component. */
export type ComarkReactComponentDefinition = ComarkComponentDefinition<ComarkReactNodeView>;

/** {@link ComarkComponentExports} whose `extension` renders `nodeView` via `ReactNodeViewRenderer`. */
export type ComarkReactComponentExports = ComarkComponentExports<ComarkReactNodeView>;

/**
 * Wrap the framework-agnostic {@link defineComarkComponent} so a `nodeView`
 * React component is installed via `ReactNodeViewRenderer`.
 *
 * @example
 * ```tsx
 * const Alert = defineComarkReactComponent({
 *   name: 'alert',
 *   kind: 'block',
 *   props: { type: { type: 'string', default: 'info' } },
 *   nodeView: AlertNodeView,
 * })
 * ```
 */
export function defineComarkReactComponent(
  def: ComarkReactComponentDefinition,
): ComarkReactComponentExports {
  const base = defineComarkComponent<ComarkReactNodeView>(def);
  if (!def.nodeView) return base;

  const nodeView = def.nodeView;
  const extension = base.extension.extend({
    addNodeView() {
      return ReactNodeViewRenderer(nodeView);
    },
  });

  return { ...base, extension };
}
