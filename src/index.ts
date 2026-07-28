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
  ResolveSrc,
  ResolveSrcContext,
  SetterContext,
  SetterInput,
} from "./types";

/* @internal — content-routing helpers shared by the framework bindings; not part of the public API. */
export { applyContent, isComarkTreeLike, readByFlavor, safeJson } from "./content";

export { ComarkKit, type ComarkKitOptions } from "./kit";

// Serializer surface
export {
  ComarkSerializer,
  comarkToPmDoc,
  createSerializer,
  pmDocToComark,
  type ComarkErrorContext,
  type ComarkErrorHandler,
  type ComarkSerializerOptions,
  type ComarkSerializerStorage,
  type SerializerSpecs,
  type SetComarkContentOptions,
} from "./serializer";

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
export { attrsEqual, cleanAttrs, hasNoHtmlAttrs, mergeAttrs, splitAttrs } from "./utils/attrs";
export { autoUnwrapBlocks } from "./utils/auto-unwrap";
export { collectDomAttrs, htmlAttrSpec, type HtmlAttrSpecOptions } from "./utils/html-attrs";
export { parseSrcset, resolveSrcset, type SrcsetCandidate } from "./utils/srcset";
