export type {
  CommentNode,
  ElementNode,
  ElementNodeAttributes,
  ComarkHelpers,
  Node,
  TextNode,
  MarkdownDocument,
  ContentType,
  ContentValue,
  JSONContent,
  MarkSpec,
  NodeSpec,
  PMMark,
  ResolveSrc,
  ResolveSrcContext,
  SetterContext,
  SetterInput,
} from "./types";

export { ComarkKit, type ComarkKitOptions } from "./kit";

// Serializer surface
export {
  ComarkSerializer,
  comarkToPmDoc,
  createSerializer,
  pmDocToComark,
  type ComarkErrorContext,
  type ComarkErrorHandler,
  type ComarkParserOptions,
  type ComarkSerializerOptions,
  type ComarkSerializerStorage,
  type SerializerSpecs,
  type SetComarkContentOptions,
} from "./serializer";
export type { ComarkStreamSession } from "./stream";

// Comark-specific Tiptap extensions
export { ComarkCodeBlock } from "./extensions/code-block";
export { ComarkComment } from "./extensions/comment";
export { ComarkImage, type ComarkImageOptions } from "./extensions/image";
export { ComarkPicture, type ComarkPictureOptions } from "./extensions/picture";
export { ComarkTemplate } from "./extensions/template";
export {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
  type ComarkComponentProp,
} from "./extensions/component";

// Global-attrs extension (ComarkKit already adds it)
export { ComarkAttrs } from "./attrs";

// Operational stylesheet
export { COMARK_STYLE_MARKER, comarkStyle, injectComarkStyles } from "./style";

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
  pictureSpec,
  strikeSpec,
  tableCellSpec,
  tableHeaderSpec,
  tableRowSpec,
  tableSpec,
  templateSpec,
} from "./specs";

// Utilities
export {
  attrsEqual,
  cleanAttrs,
  hasNoHtmlAttrs,
  mergeAttrs,
  readHtmlAttrsBag,
  splitAttrs,
} from "./utils/attrs";
export { autoUnwrapBlocks } from "./utils/auto-unwrap";
export { collectDomAttrs, htmlAttrSpec, type HtmlAttrSpecOptions } from "./utils/html-attrs";
export { parseSrcset, resolveSrcset, type SrcsetCandidate } from "./utils/srcset";
