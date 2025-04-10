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

    it("should convert h1 to h2 when pasting", async () => {
        // Mount the editor with empty content
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "",
            },
        });

        // Wait until the editor is initialized and rendered
        await waitForExpect(() => {
            expect(wrapper.find(".tiptap").exists()).toBe(true);
        });

        // Find the contenteditable element (editor)
        const editorEl = wrapper.find(".tiptap").element;

        // Create a paste event with type "paste"
        const pasteEvent = new Event("paste", {
            bubbles: true,
            cancelable: true,
        });

        // Mock clipboardData so it returns an h1 when the editor requests "text/html"
        Object.defineProperty(pasteEvent, "clipboardData", {
            value: {
                getData: (type: string) => {
                    if (type === "text/html") {
                        return "<h1>My Heading</h1>";
                    }
                    return "";
                },
            },
        });

        // Dispatch the paste event on the editor element
        editorEl.dispatchEvent(pasteEvent);

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("<h2>My Heading</h2>");
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
