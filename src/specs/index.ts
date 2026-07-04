import { blockquoteSpec } from './blockquote'
import { codeBlockSpec } from './code-block'
import { commentSpec } from './comment'
import { hardBreakSpec } from './hard-break'
import { headingSpec } from './heading'
import { horizontalRuleSpec } from './horizontal-rule'
import { imageSpec } from './image'
import { bulletListSpec, listItemSpec, orderedListSpec } from './lists'
import { boldSpec, codeSpec, italicSpec, linkSpec, strikeSpec } from './marks'
import { paragraphSpec } from './paragraph'
import { tableCellSpec, tableHeaderSpec, tableRowSpec, tableSpec } from './table'
import { templateSpec } from './template'
import type { MarkSpec, NodeSpec } from '../types'

export {
  blockquoteSpec,
  boldSpec,
  bulletListSpec,
  codeBlockSpec,
  codeSpec,
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
}

/** The full spec set the kit dispatches on; pass to `createSerializer` or `ComarkSerializer.configure`. */
export const comarkSpecs: { nodes: NodeSpec[]; marks: MarkSpec[] } = {
  nodes: [
    paragraphSpec,
    headingSpec,
    blockquoteSpec,
    bulletListSpec,
    orderedListSpec,
    listItemSpec,
    codeBlockSpec,
    horizontalRuleSpec,
    imageSpec,
    tableSpec,
    tableRowSpec,
    tableHeaderSpec,
    tableCellSpec,
    templateSpec,
    commentSpec,
    hardBreakSpec,
  ],
  marks: [boldSpec, italicSpec, strikeSpec, codeSpec, linkSpec],
}
