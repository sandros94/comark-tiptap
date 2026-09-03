import { mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useComarkEditor } from "comark-tiptap/vue";
import theme from "#build/ui/editor";
import { tv } from "@nuxt/ui/utils/tv";
import UApp from "@nuxt/ui/runtime/components/App.vue";
import UEditor from "@nuxt/ui/runtime/components/Editor.vue";
import UEditorToolbar from "@nuxt/ui/runtime/components/EditorToolbar.vue";

import IndexPage from "../../app/pages/index.vue";

describe("UEditor external editor", () => {
  const seed = "# Comark external editor\n\nA **Comark-backed** paragraph.";
  const externalEditorUi = tv({ base: theme.slots.base[0] });
  const externalEditorClass = externalEditorUi({ class: "external-editor-sentinel w-auto" });
  const builtInProseClasses = theme.slots.base.slice(1).flatMap((classes) => classes.split(" "));

  const PageFixture = defineComponent({
    components: { IndexPage, UApp },
    template: "<UApp><IndexPage /></UApp>",
  });

  const Fixture = defineComponent({
    components: { UEditor, UEditorToolbar },
    setup() {
      const { editor } = useComarkEditor({
        content: seed,
        contentType: "markdown",
        editorOptions: {
          editorProps: {
            attributes: {
              class: externalEditorClass,
            },
          },
        },
      });
      const toolbarItems = ref([[{ kind: "mark", mark: "bold" }]]);

      return { editor, toolbarItems };
    },
    template: `
      <UEditor :editor="editor" data-test="external-editor">
        <template #default="{ editor: activeEditor }">
          <UEditorToolbar
            :editor="activeEditor"
            :items="toolbarItems"
            data-test="external-toolbar"
          />
        </template>
      </UEditor>
    `,
  });

  it("uses the generated layout and wrapper prose in the live example", async () => {
    const wrapper = await mountSuspended(PageFixture);
    const section = wrapper.get('[data-test="comark-editor-section"]');

    await vi.waitFor(() => {
      expect(section.get(".ProseMirror").text()).toContain("Side-by-side compare");
    });

    const editable = section.get(".ProseMirror");
    expect(editable.classes()).toContain("w-full");
    expect(editable.classes()).toContain("outline-none");
    expect(editable.classes().filter((name) => builtInProseClasses.includes(name))).toEqual([]);
    expect(section.get('[data-slot="content"]').classes()).toContain(
      "[&_:where(.ProseMirror_p)]:leading-7",
    );

    wrapper.unmount();
  });

  it("renders a Comark editor and passes it to UEditor children", async () => {
    const wrapper = await mountSuspended(Fixture);

    await vi.waitFor(() => expect(wrapper.vm.editor).toBeDefined());
    await nextTick();

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="external-editor"]').text()).toContain("Comark external editor");
    });

    const editable = wrapper.get(".ProseMirror");
    expect(editable.classes()).toContain("external-editor-sentinel");
    expect(editable.classes()).toContain("w-auto");
    expect(editable.classes()).toContain("outline-none");
    expect(editable.classes()).not.toContain("w-full");
    expect(editable.classes().filter((name) => builtInProseClasses.includes(name))).toEqual([]);
    expect(wrapper.get('[data-slot="content"]').classes()).toContain(
      "[&_:where(.ProseMirror_p)]:leading-7",
    );
    expect(wrapper.get('[data-test="external-toolbar"] button').element.tagName).toBe("BUTTON");

    wrapper.unmount();
  });
});
