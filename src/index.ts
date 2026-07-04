export type {
  ComarkComment as ComarkCommentTuple,
  ComarkElement,
  ComarkElementAttributes,
  ComarkHelpers,
  ComarkNode,
  ComarkText,
  ComarkTree,
  ContentType,
  ContentValue,
  JSONContent,
  MarkSpec,
  NodeSpec,
  PMMark,
  SetterContext,
  SetterInput,
} from './types'

export { ComarkKit, type ComarkKitOptions } from './kit'

// Serializer surface
export {
  ComarkSerializer,
  comarkToPmDoc,
  createSerializer,
  pmDocToComark,
  type ComarkSerializerOptions,
  type ComarkSerializerStorage,
  type SerializerSpecs,
  type SetComarkContentOptions,
} from './serializer'

// Comark-specific Tiptap extensions
export { ComarkCodeBlock } from './extensions/code-block'
export { ComarkComment } from './extensions/comment'
export { ComarkTemplate } from './extensions/template'
export {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
  type ComarkComponentProp,
} from './extensions/component'

// Global-attrs extension (ComarkKit already adds it)
export { ComarkAttrs } from './attrs'

// Operational stylesheet
export { COMARK_STYLE_MARKER, comarkStyle, injectComarkStyles } from './style'

// Spec objects and the aggregate
export {
  blockquoteSpec,
  boldSpec,
  bulletListSpec,
  codeBlockSpec,
  codeSpec,
  comarkSpecs,
  commentSpec,
  hardBreakSpec,
  headingSpec,
  horizontalRuleSpec,
  imageSpec,
  italicSpec,
  linkSpec,
  listItemSpec,
  orderedListSpec,
  paragraphSpec,
  strikeSpec,
  tableCellSpec,
  tableHeaderSpec,
  tableRowSpec,
  tableSpec,
  templateSpec,
} from './specs'

// Utilities
export { attrsEqual, cleanAttrs, hasNoHtmlAttrs, mergeAttrs, splitAttrs } from './utils/attrs'
export { autoUnwrapBlocks } from './utils/auto-unwrap'
export { htmlAttrSpec, type HtmlAttrSpecOptions } from './utils/html-attrs'
