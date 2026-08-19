import { describe, expect, it } from "vitest";
import { createSerializer } from "../../src/serializer";
import { paragraphSpec } from "../../src/specs/paragraph";
import { pictureSpec } from "../../src/specs/picture";
import type { ElementNode, JSONContent } from "../../src/types";
import { defineComarkComponent } from "../../src/extensions/component";

describe("defineComarkComponent — block component", () => {
  const Alert = defineComarkComponent({
    name: "alert",
    kind: "block",
    props: {
      type: { type: "string", default: "info" },
      title: { type: "string" },
      dismissible: { type: "boolean", default: false },
      count: { type: "number" },
    },
  });
  const helpers = createSerializer({
    nodes: [paragraphSpec, Alert.spec],
    marks: [],
  });

  it("lifts declared props into native PM attrs", () => {
    const result = Alert.spec.fromComark(
      [
        "alert",
        { "type": "warning", "title": "Heads up", ":dismissible": "true", ":count": "3" },
        ["p", {}, "Hi"],
      ] as ElementNode,
      helpers,
    );
    expect(result?.attrs).toMatchObject({
      type: "warning",
      title: "Heads up",
      dismissible: true,
      count: 3,
    });
  });

  it("routes leftover element attrs into htmlAttrs", () => {
    const result = Alert.spec.fromComark(
      [
        "alert",
        { "type": "info", "class": "lead", "data-foo": "bar" },
        ["p", {}, "Hi"],
      ] as ElementNode,
      helpers,
    );
    expect(result?.attrs).toMatchObject({
      type: "info",
      htmlAttrs: { "class": "lead", "data-foo": "bar" },
    });
  });

  it("round-trips a fully-loaded alert (autoUnwrapped on output)", () => {
    // Block components autoUnwrap a single attrless paragraph child, so
    // the round-trip output uses the canonical Comark form.
    const original: ElementNode = [
      "alert",
      {
        "type": "warning",
        "title": "Heads up",
        ":dismissible": "true",
        "class": "lead",
        "data-foo": "bar",
      },
      "Body",
    ];
    const pm = Alert.spec.fromComark(original, helpers)!;
    const back = Alert.spec.toComark(pm, helpers);
    expect(back).toEqual(original);
  });

  it("also accepts the wrapped form on input and emits the autoUnwrapped form", () => {
    const wrapped: ElementNode = ["alert", { type: "info" }, ["p", {}, "Body"]];
    const pm = Alert.spec.fromComark(wrapped, helpers)!;
    const back = Alert.spec.toComark(pm, helpers);
    expect(back).toEqual(["alert", { "type": "info", ":dismissible": "false" }, "Body"]);
  });

  it("applies declared defaults for missing props", () => {
    const result = Alert.spec.fromComark(["alert", {}, ["p", {}, "x"]] as ElementNode, helpers);
    // `type` has a default; `dismissible` has a default; the rest are undefined.
    expect(result?.attrs?.type).toBe("info");
    expect(result?.attrs?.dismissible).toBe(false);
  });

  it("seeds an empty paragraph when the body is empty (PM `block+` cannot be empty)", () => {
    const result = Alert.spec.fromComark(["alert", { type: "info" }] as ElementNode, helpers);
    expect(result?.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("defineComarkComponent — block component with dual-context atoms (picture)", () => {
  const Card = defineComarkComponent({ name: "card", kind: "block" });
  const picHelpers = createSerializer({
    nodes: [paragraphSpec, Card.spec, pictureSpec],
    marks: [],
  });
  const PIC: ElementNode = ["picture", {}, ["img", { src: "/a.png" }]];
  const PIC_PM: JSONContent = { type: "picture", attrs: { sources: [], img: { src: "/a.png" } } };

  it("emits a bare picture for a sole picture-only paragraph", () => {
    const pm: JSONContent = {
      type: "card",
      content: [{ type: "paragraph", content: [PIC_PM] }],
    };
    const el = Card.spec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["card", {}, PIC]);
    const back = Card.spec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual([{ type: "paragraph", content: [PIC_PM] }]);
  });

  it("hoists a picture-only paragraph sitting beside a text paragraph", () => {
    const pm: JSONContent = {
      type: "card",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "paragraph", content: [PIC_PM] },
      ],
    };
    const el = Card.spec.toComark(pm, picHelpers) as ElementNode;
    expect(el).toEqual(["card", {}, ["p", {}, "A"], PIC]);
    const back = Card.spec.fromComark(el, picHelpers)!;
    expect(back.content).toEqual(pm.content);
  });
});

describe("defineComarkComponent — inline component", () => {
  const Badge = defineComarkComponent({
    name: "badge",
    kind: "inline",
    props: {
      color: { type: "string", default: "gray" },
    },
  });
  const helpers = createSerializer({
    nodes: [paragraphSpec, Badge.spec],
    marks: [],
  });

  it("round-trips a badge with content and props", () => {
    const original: ElementNode = ["p", {}, "Status: ", ["badge", { color: "green" }, "New"], "."];
    const pm = paragraphSpec.fromComark(original, helpers)!;
    expect(pm.content?.[1]).toEqual({
      type: "badge",
      attrs: { color: "green" },
      content: [{ type: "text", text: "New" }],
    });
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original);
  });

  it("handles JSON props", () => {
    const Box = defineComarkComponent({
      name: "box",
      kind: "inline",
      props: { config: { type: "json" } },
    });
    const h = createSerializer({ nodes: [paragraphSpec, Box.spec], marks: [] });
    const pm = Box.spec.fromComark(
      ["box", { ":config": '{"size":3,"open":true}' }] as ElementNode,
      h,
    )!;
    expect(pm.attrs?.config).toEqual({ size: 3, open: true });
    const back = Box.spec.toComark(pm, h);
    expect(back).toEqual(["box", { ":config": '{"size":3,"open":true}' }]);
  });
});
