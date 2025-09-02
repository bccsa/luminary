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
});
