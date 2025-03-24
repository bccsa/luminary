import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RichTextEditor from "./RichTextEditor.vue";
import waitForExpect from "wait-for-expect";

describe("RichTextEditor", () => {
    it("mounts with content", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Gandalf the Grey</p>",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Gandalf the Grey");
        });
    });

    it("updates content correctly", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: JSON.stringify({
                    type: "doc",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Test" }] }],
                }),
            },
        });

        //@ts-expect-error
        const editor = wrapper.vm.editor;
        expect(editor).toBeDefined();

        editor.commands.setContent("Testing Testing 123");

        editor.options.onUpdate?.({ editor });

        await waitForExpect(() => {
            //@ts-expect-error
            const updatedText = JSON.parse(wrapper.vm.text);
            expect(updatedText.content[0].content[0].text).toBe("Testing Testing 123");
        });
    });
});
