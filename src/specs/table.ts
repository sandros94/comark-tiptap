import { hasNoHtmlAttrs, mergeAttrs, splitAttrs } from "../utils/attrs";
import type { ComarkElement, ComarkHelpers, ComarkNode, JSONContent, NodeSpec } from "../types";

// #region table

/** table ↔ Comark `table`; rows are grouped into `thead`/`tbody` on serialize. */
export const tableSpec: NodeSpec = {
  pmName: "table",
  tags: ["table"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );

    const rows = (node.content ?? []).filter((r) => r.type === "tableRow");
    const isAllHeaders = (row: JSONContent): boolean =>
      (row.content?.length ?? 0) > 0 && (row.content ?? []).every((c) => c.type === "tableHeader");

    /* Only a LEADING run of all-header rows becomes <thead>. A header row that
       isn't part of that prefix stays in document order inside <tbody> (as th
       cells) — bucketing every all-header row into <thead> would silently
       reorder rows whenever a header row wasn't already first. */
    let split = 0;
    while (split < rows.length && isAllHeaders(rows[split])) split++;

    const serializeRows = (src: JSONContent[]): ComarkElement[] => {
      const out: ComarkElement[] = [];
      for (const row of src) {
        const el = h.serializeBlocks([row])[0] as ComarkElement | undefined;
        if (el) out.push(el);
      }
      return out;
    };
    const headerRows = serializeRows(rows.slice(0, split));
    const bodyRows = serializeRows(rows.slice(split));

    const children: ComarkNode[] = [];
    if (headerRows.length > 0) children.push(["thead", {}, ...headerRows]);
    if (bodyRows.length > 0) children.push(["tbody", {}, ...bodyRows]);
    return ["table", attrs, ...children];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);

    /* Also tolerates a stripped-down `[table, attrs, …rows]` with no thead/tbody. */
    const rows: JSONContent[] = [];
    for (const child of children) {
      if (!Array.isArray(child) || child[0] === null) continue;
      const tag = child[0] as string;
      if (tag === "thead" || tag === "tbody") {
        for (const row of child.slice(2) as ComarkNode[]) {
          if (Array.isArray(row) && row[0] === "tr") {
            const json = h.parseBlocks([row])[0];
            if (json) rows.push(json);
          }
        }
      } else if (tag === "tr") {
        const json = h.parseBlocks([child])[0];
        if (json) rows.push(json);
      }
    }

    /* PM's Table schema is `tableRow+`; a rowless table (odd hand-authored AST)
       needs a minimal 1×1 cell or the doc is invalid. */
    const out: JSONContent = {
      type: "table",
      content:
        rows.length > 0
          ? rows
          : [
              {
                type: "tableRow",
                content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
              },
            ],
    };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};

// #region tableRow

/** tableRow ↔ Comark `tr`. */
export const tableRowSpec: NodeSpec = {
  pmName: "tableRow",
  tags: ["tr"],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    );
    return ["tr", attrs, ...h.serializeBlocks(node.content)];
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...cells] = el;
    const { htmlAttrs } = splitAttrs(rawAttrs, []);
    const content = cells
      .map((c) => (Array.isArray(c) ? h.parseBlocks([c])[0] : null))
      .filter((c): c is JSONContent => c != null);
    const out: JSONContent = { type: "tableRow", content };
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs };
    return out;
  },
};

// #region tableHeader / tableCell — share the same body

/* `align` is read as a native input attr (hand-authored ASTs use it), but the
   PM `align` attr is serialized back out as `style:"text-align:X"` — comark's
   renderer only honours alignment expressed that way, and comark itself emits
   alignment as a `style` attr. `style` is reserved on cells (see attrs.ts) so a
   DOM round-trip doesn't also harvest the rendered text-align into htmlAttrs. */
const CELL_SEMANTIC = ["colspan", "rowspan", "colwidth", "align"] as const;

/* Pull `text-align` out of a CSS `style` string, keeping any other
   declarations (comark cells only carry text-align, but hand-authored /
   DOM-round-tripped cells may carry more). */
function extractTextAlign(style: string): { align?: string; rest: string } {
  let align: string | undefined;
  const kept: string[] = [];
  for (const decl of style.split(";")) {
    const trimmed = decl.trim();
    if (trimmed === "") continue;
    const m = /^text-align\s*:\s*(\S+)/i.exec(trimmed);
    if (m) align = m[1].toLowerCase();
    else kept.push(trimmed);
  }
  return { align, rest: kept.join("; ") };
}

/* Merge `text-align:<align>` into a style bag, replacing any prior text-align.
   Emits comark's compact `text-align:left` form (no space) for clean round-trips. */
function withTextAlign(style: unknown, align: string): string {
  const rest = typeof style === "string" ? extractTextAlign(style).rest : "";
  const ta = `text-align:${align}`;
  return rest ? `${ta}; ${rest}` : ta;
}

function makeCellSpec(pmName: "tableHeader" | "tableCell", tag: "th" | "td"): NodeSpec {
  return {
    pmName,
    tags: [tag],
    toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
      const semantic: Record<string, unknown> = {};
      const colspan = node.attrs?.colspan;
      const rowspan = node.attrs?.rowspan;
      const colwidth = node.attrs?.colwidth;
      const align = node.attrs?.align;
      if (colspan != null && Number(colspan) !== 1) semantic.colspan = Number(colspan);
      if (rowspan != null && Number(rowspan) !== 1) semantic.rowspan = Number(rowspan);
      if (colwidth != null) semantic.colwidth = colwidth;

      const htmlAttrs: Record<string, unknown> = {
        ...(node.attrs?.htmlAttrs as Record<string, unknown> | undefined),
      };
      if (typeof align === "string" && align.length > 0) {
        htmlAttrs.style = withTextAlign(htmlAttrs.style, align);
      }

      const attrs = mergeAttrs(semantic, htmlAttrs);

      /* A single attrless paragraph flattens to inlines (canonical markdown cell); anything else serializes as blocks. DOM-roundtripped cells (PM-default `htmlAttrs: {}`) still count as attrless. */
      const content = node.content ?? [];
      if (content.length === 1 && content[0]?.type === "paragraph" && hasNoHtmlAttrs(content[0])) {
        return [tag, attrs, ...h.serializeInlines(content[0]?.content)];
      }
      return [tag, attrs, ...h.serializeBlocks(content)];
    },

    fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
      const [, rawAttrs, ...children] = el;
      const { semantic, htmlAttrs } = splitAttrs(rawAttrs, CELL_SEMANTIC);

      /* colspan/rowspan default to 1; drop them so the PM JSON stays round-trip-equal with the parser output. */
      const attrs: Record<string, unknown> = {};
      if (semantic.colspan != null && Number(semantic.colspan) !== 1) {
        attrs.colspan = Number(semantic.colspan);
      }
      if (semantic.rowspan != null && Number(semantic.rowspan) !== 1) {
        attrs.rowspan = Number(semantic.rowspan);
      }
      /* PM types colwidth as `number[]`; coerce so a hand-authored string/mixed AST can't corrupt column-resize math. */
      if (Array.isArray(semantic.colwidth)) {
        const cw = semantic.colwidth.map((n) => Number(n)).filter((n) => Number.isFinite(n));
        if (cw.length > 0) attrs.colwidth = cw;
      }
      /* Alignment: a native `align` (hand-authored), else `text-align` parsed
         out of comark's `style` attr. Non-alignment style declarations stay in
         htmlAttrs. */
      let align =
        typeof semantic.align === "string" && semantic.align.length > 0
          ? semantic.align
          : undefined;
      if (typeof htmlAttrs.style === "string") {
        const { align: styleAlign, rest } = extractTextAlign(htmlAttrs.style);
        if (styleAlign && !align) align = styleAlign;
        if (rest) htmlAttrs.style = rest;
        else delete htmlAttrs.style;
      }
      if (align) attrs.align = align;
      if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs;

      /* PM cells need block content: wrap inline runs in a single paragraph, but switch to block mode if a real block child is present. */
      const hasBlock = children.some((c) => Array.isArray(c) && isCellBlockTag(c[0]));
      let content: JSONContent[];
      if (hasBlock) {
        content = h.parseBlocks(children);
      } else {
        const inlines = h.parseInlines(children);
        content =
          inlines.length > 0 ? [{ type: "paragraph", content: inlines }] : [{ type: "paragraph" }];
      }

      const out: JSONContent = { type: pmName, content };
      if (Object.keys(attrs).length > 0) out.attrs = attrs;
      return out;
    },
  };
}

function isCellBlockTag(tag: unknown): boolean {
  if (typeof tag !== "string") return false;
  return (
    tag === "p" ||
    tag === "blockquote" ||
    tag === "ul" ||
    tag === "ol" ||
    tag === "pre" ||
    tag === "hr" ||
    tag === "table" ||
    tag.match(/^h[1-6]$/) !== null
  );
}

/** tableHeader ↔ Comark `th`. */
export const tableHeaderSpec = makeCellSpec("tableHeader", "th");
/** tableCell ↔ Comark `td`. */
export const tableCellSpec = makeCellSpec("tableCell", "td");
