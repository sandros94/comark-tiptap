import { mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useComarkEditor } from "comark-tiptap/vue";
import UEditor from "@nuxt/ui/runtime/components/Editor.vue";
import UEditorToolbar from "@nuxt/ui/runtime/components/EditorToolbar.vue";

const seed = "# Comark external editor\n\nA **Comark-backed** paragraph.";

const Fixture = defineComponent({
  components: { UEditor, UEditorToolbar },
  setup() {
    const { editor } = useComarkEditor({
      content: seed,
      contentType: "markdown",
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

describe("UEditor external editor", () => {
  it("renders a Comark editor and passes it to UEditor children", async () => {
    const wrapper = await mountSuspended(Fixture);

    await vi.waitFor(() => expect(wrapper.vm.editor).toBeDefined());
    await nextTick();

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="external-editor"]').text()).toContain("Comark external editor");
    });
    expect(wrapper.find('[data-test="external-toolbar"] button').exists()).toBe(true);
  });
});
