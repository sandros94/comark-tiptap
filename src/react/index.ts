export { ComarkEditor, type ComarkEditorProps } from "./comark-editor";

export {
  useComarkEditor,
  type SetContentOptions,
  type UseComarkEditorOptions,
  type UseComarkEditorReturn,
} from "./use-comark-editor";

export {
  defineComarkReactComponent,
  type ComarkReactComponentDefinition,
  type ComarkReactComponentExports,
} from "./define-component";

/* Re-export the react `Editor` class for consumer customization. */
export { Editor } from "@tiptap/react";

/* Re-export the types most users will need from `comark-tiptap`. */
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
