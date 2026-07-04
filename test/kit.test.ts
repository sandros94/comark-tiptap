import { parse } from "comark";
import { renderMarkdown } from "comark/render";
import { describe, expect, it } from "vitest";
import { defineComarkComponent } from "../src/extensions/component";
import { comarkToPmDoc, createSerializer, pmDocToComark } from "../src/serializer";
import { comarkSpecs } from "../src/specs";
import type { ComarkNode, ComarkTree } from "../src/types";

const baseHelpers = createSerializer(comarkSpecs);

/**
 * Strip Comark's `$` source-position bag so the equality check focuses
 * on meaningful structure.
 */
function cleanTree(tree: ComarkTree): ComarkTree {
  return {
    nodes: tree.nodes.map(cleanNode),
    frontmatter: { ...tree.frontmatter },
    meta: {},
  };
}

function cleanNode(node: ComarkNode): ComarkNode {
  if (typeof node === "string") return node;
  if (!Array.isArray(node)) return node;
  const [tag, attrs, ...children] = node;
  const cleanAttrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === "$") continue;
    cleanAttrs[k] = v;
  }
  return [
    tag,
    cleanAttrs,
    ...children.map((c) => cleanNode(c as ComarkNode)),
  ] as unknown as ComarkNode;
}

async function rt(md: string, helpers = baseHelpers): Promise<ComarkTree> {
  const tree = await parse(md);
  const pm = comarkToPmDoc(tree, helpers);
  return pmDocToComark(pm, helpers);
}

describe("full-document round-trip", () => {
  it.each<[string, string]>([
    ["heading", "# Hello World\n"],
    ["paragraph with marks", "A **B** *C* ~~D~~ `E`.\n"],
    ["heading with id", "# Hi {#welcome .lead}\n"],
    ["blockquote with mark inside", "> Look **here** thanks.\n"],
    ["horizontal rule", "---\n"],
    ["hard break", "a  \nb\n"],
    ["link with title", '[hi](https://x.io "T")\n'],
    ["link with target/rel", '[go](https://x.io){target="_blank" rel="noopener"}\n'],
    ["image with alt", "![alt text](/x.png)\n"],
    ["bullet list", "- one\n- two\n- three\n"],
    ["ordered list with start", "5. one\n6. two\n"],
    ["nested list", "- a\n  - b\n  - c\n"],
    ["code block with lang", "```ts\nconst x = 1\n```\n"],
    [
      "code block with filename and highlights",
      "```ts [a.ts] {1,3}\nlet a = 1\nlet b = 2\nlet c = 3\n```\n",
    ],
    ["table", "| A | B |\n| - | - |\n| 1 | 2 |\n"],
    ["table with alignment", "| Left | Mid | Right |\n| :--- | :-: | ---: |\n| a | b | c |\n"],
  ])("round-trips: %s", async (_label, md) => {
    const a = cleanTree(await parse(md));
    const b = cleanTree(await rt(md));
    expect(b.nodes).toEqual(a.nodes);
  });

  it("round-trips bold-with-attribute losslessly without a comarkExtras carrier", async () => {
    const md = "A **bold**{.foo #b1} word.\n";
    const a = cleanTree(await parse(md));
    const b = cleanTree(await rt(md));
    // The class and id ride on the bold mark schema, not on a sidecar.
    expect(b.nodes).toEqual(a.nodes);
  });

  it("round-trips a markdown comment through the comment node", async () => {
    const md = "<!-- TODO -->\n\nAfter\n";
    const a = cleanTree(await parse(md));
    const b = cleanTree(await rt(md));
    expect(b.nodes).toEqual(a.nodes);
  });

  it("renders the resulting AST back to markdown via comark/render", async () => {
    // A second round-trip through `renderMarkdown` confirms the AST
    // our editor produces is one Comark itself can serialize without
    // choking.
    const md = "# Hello\n\nA **B** [link](/x).\n";
    const tree = await rt(md);
    const out = await renderMarkdown(tree);
    const reparsed = cleanTree(await parse(out));
    const original = cleanTree(await parse(md));
    expect(reparsed.nodes).toEqual(original.nodes);
  });
});

describe("full-document round-trip with custom components", () => {
  const Alert = defineComarkComponent({
    name: "alert",
    kind: "block",
    props: {
      type: { type: "string", default: "info" },
      title: { type: "string" },
    },
  });
  const helpers = createSerializer({
    nodes: [...comarkSpecs.nodes, Alert.spec],
    marks: comarkSpecs.marks,
  });

  it("preserves an alert with both schema-typed props and HTML extras", async () => {
    const md = '::alert{type="warning" title="Heads up" .ring}\nBody **bold** here.\n::\n';
    const a = cleanTree(await parse(md));
    const tree = await parse(md);
    const pm = comarkToPmDoc(tree, helpers);
    const back = cleanTree(pmDocToComark(pm, helpers));
    expect(back.nodes).toEqual(a.nodes);
  });

  it("preserves an inline component with content and props", async () => {
    const Badge = defineComarkComponent({
      name: "badge",
      kind: "inline",
      props: { color: { type: "string", default: "gray" } },
    });
    const h = createSerializer({
      nodes: [...comarkSpecs.nodes, Badge.spec],
      marks: comarkSpecs.marks,
    });

    const md = 'Status: :badge[New]{color="green"}.\n';
    const a = cleanTree(await parse(md));
    const tree = await parse(md);
    const pm = comarkToPmDoc(tree, h);
    const back = cleanTree(pmDocToComark(pm, h));
    expect(back.nodes).toEqual(a.nodes);
  });
});
