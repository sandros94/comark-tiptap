export { ComarkEditor } from "./comark-editor";

export type {
  ComarkEditorEmits,
  ComarkEditorExpose,
  ComarkEditorModelModifiers,
  ComarkEditorProps,
  ComarkEditorSlots,
} from "./comark-editor.types";

export {
  useComarkEditor,
  type SetContentOptions,
  type UseComarkEditorOptions,
  type UseComarkEditorReturn,
} from "./use-comark-editor";

export {
  defineComarkVueComponent,
  type ComarkVueComponentDefinition,
  type ComarkVueComponentExports,
} from "./define-component";

// Re-export the vue-3 `Editor` class for consumer customization.
export { Editor } from "@tiptap/vue-3";

// Re-export the types most users will need from `comark-tiptap`.
export type {
  ComarkCommentTuple,
  ComarkElement,
  ComarkElementAttributes,
  ComarkErrorContext,
  ComarkErrorHandler,
  ComarkKitOptions,
  ComarkNode,
  ComarkText,
  ComarkTree,
  ContentType,
  ContentValue,
  JSONContent,
  PMMark,
  SetComarkContentOptions,
  SetterContext,
  SetterInput,
} from "comark-tiptap";
