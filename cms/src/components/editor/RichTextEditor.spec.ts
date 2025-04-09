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

    it("checks if the word has link", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: '<p><a href="https://example.com">Gandalf the Grey</a></p>',
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Gandalf the Grey");
            // expect the word to be a link
            expect(wrapper.find("a").exists()).toBe(true);
            expect(wrapper.find("a").attributes("href")).toBe("https://example.com");
        });
    });

    // The simulation of the selection is hard to test
});
