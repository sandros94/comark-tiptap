/*
 * Binding-support entry (`comark-tiptap/internal`), shared by
 * `comark-tiptap/vue` and `comark-tiptap/react` so the content dispatch/read
 * logic lives once. NOT part of the semver-supported public API — anything
 * here may change without notice.
 */
export {
  applyContent,
  createPushScheduler,
  isMarkdownDocumentLike,
  MODEL_APPLY_META,
  readByFlavor,
  safeJson,
  type PushScheduler,
  type SetContentCallOptions,
} from "./content";
