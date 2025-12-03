import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RichTextEditor from "./RichTextEditor.vue";
import waitForExpect from "wait-for-expect";

describe("RichTextEditor", () => {
    it("mounts with content", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Gandalf the Grey</p>",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Gandalf the Grey");
        });
    });

    it("should call formatPastedHtml and convert h1 to h2 when pasting", async () => {
        // Mock the formatPastedHtml module
        vi.mock("@/util/formatPastedHtml", () => ({
            default: vi.fn().mockReturnValue("<h2>My Heading</h2>"), // Mock the function to return <h2>
        }));

        const formatPastedHtml = (await import("@/util/formatPastedHtml")).default;

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find(".tiptap").exists()).toBe(true);
        });

        const editorEl = wrapper.find(".tiptap").element;

        const pasteEvent = new Event("paste", {
            bubbles: true,
            cancelable: true,
        });

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

        editorEl.dispatchEvent(pasteEvent);

        await waitForExpect(() => {
            expect(formatPastedHtml).toHaveBeenCalledWith("<h1>My Heading</h1>");
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
                textLanguage: "lang-eng",
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

    it("updates editor content when text prop changes externally (from page size change - where formatting of text may change", async () => {
        const initialText = JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Initial text" }] }],
        });

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: initialText,
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            //@ts-expect-error
            expect(wrapper.vm.editor).toBeDefined();
        });

        //@ts-expect-error
        //eslint disabled for line 115 as it is used to ensure the editor is defined for the test    
        //eslint-disable-next-line @typescript-eslint/no-unused-vars
        const editor = wrapper.vm.editor;

        // Verify initial content
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Initial text");
        });

        // Simulate external text prop change (e.g., from another editor instance)
        const newText = JSON.stringify({
            type: "doc",
            content: [
                { type: "paragraph", content: [{ type: "text", text: "Updated externally" }] },
            ],
        });

        await wrapper.setProps({ text: newText });

        // Verify editor content updated
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Updated externally");
            expect(wrapper.text()).not.toContain("Initial text");
        });
    });

    it("does not update editor when text prop changes to same content (avoids infinite loops)", async () => {
        const textContent = JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Same content" }] }],
        });

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: textContent,
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            //@ts-expect-error
            expect(wrapper.vm.editor).toBeDefined();
        });

        //@ts-expect-error
        const editor = wrapper.vm.editor;
        const setContentSpy = vi.spyOn(editor.commands, "setContent");

        // Clear the spy call from initial mount
        setContentSpy.mockClear();

        // Set the same text prop again
        await wrapper.setProps({ text: textContent });

        // Wait a bit to ensure watcher has run
        await new Promise((resolve) => setTimeout(resolve, 100));

        // setContent should not be called because content is the same
        expect(setContentSpy).not.toHaveBeenCalled();
    });

    it("clears editor content when text prop becomes empty", async () => {
        const initialText = JSON.stringify({
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Some content" }] }],
        });

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: initialText,
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Some content");
        });

        // Set text to empty
        await wrapper.setProps({ text: "" });

        // Verify editor content is cleared
        await waitForExpect(() => {
            //@ts-expect-error
            const editor = wrapper.vm.editor;
            const content = editor.getJSON();
            expect(content.content).toBeDefined();
            // Empty content should have empty paragraph or no content
            expect(
                content.content.length === 0 ||
                    (content.content.length === 1 &&
                        content.content[0].type === "paragraph" &&
                        (!content.content[0].content || content.content[0].content.length === 0)),
            ).toBe(true);
        });
    });

    it("handles invalid JSON in text prop gracefully", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "Invalid JSON string",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            //@ts-expect-error
            expect(wrapper.vm.editor).toBeDefined();
        });

        // Should not throw error and should set content as plain text
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Invalid JSON string");
        });
    });
});
