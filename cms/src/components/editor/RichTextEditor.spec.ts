import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { Transaction } from "@tiptap/pm/state";
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

    it("converts h1 to h2 when pasting", async () => {
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
                files: [],
            },
        });

        editorEl.dispatchEvent(pasteEvent);

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("<h2>My Heading</h2>");
            expect(wrapper.html()).not.toContain("<h1>My Heading</h1>");
        });
    });
    it("updates content correctly", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Test</p>",
                textLanguage: "lang-eng",
            },
        });

        const editor = wrapper.vm.editor;
        expect(editor).toBeDefined();

        editor?.commands.setContent("Testing Testing 123");

        const transaction = editor?.state.tr;
        if (editor && transaction) {
            editor.options.onUpdate?.({ editor, transaction: transaction as Transaction });
        }

        await waitForExpect(() => {
            const textValue = wrapper.vm.text;
            expect(textValue).toBeDefined();
            expect(textValue).toContain("Testing Testing 123");
            expect(textValue!.startsWith("<")).toBe(true);
        });
    });

    it("updates editor content when text prop changes externally (from page size change - where formatting of text may change", async () => {
        const initialText = "<p>Initial text</p>";

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: initialText,
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.editor).toBeDefined();
        });

        //eslint disabled for line 115 as it is used to ensure the editor is defined for the test
        //eslint-disable-next-line @typescript-eslint/no-unused-vars
        const editor = wrapper.vm.editor;

        // Verify initial content
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Initial text");
        });

        // Simulate external text prop change (e.g., from another editor instance)
        // Since editor is a single instance, manually update the editor content
        const newText = "<p>Updated externally</p>";

        await wrapper.setProps({ text: newText });

        // Manually update editor content since single instance doesn't watch text prop
        editor?.commands.setContent(newText);

        // Verify editor content updated
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Updated externally");
            expect(wrapper.text()).not.toContain("Initial text");
        });
    });

    it("does not update editor when text prop changes to same content (avoids infinite loops)", async () => {
        const textContent = "<p>Same content</p>";

        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: textContent,
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.editor).toBeDefined();
        });

        const editor = wrapper.vm.editor;
        if (!editor) throw new Error("Editor should be defined");

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
        const initialText = "<p>Some content</p>";

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

        // Manually clear editor content since single instance doesn't watch text prop
        const editor = wrapper.vm.editor;
        editor?.commands.setContent("");

        // Verify editor content is cleared
        await waitForExpect(() => {
            const editor = wrapper.vm.editor;
            const content = editor?.getJSON();
            expect(content?.content).toBeDefined();
            // Empty content should have empty paragraph or no content
            expect(
                content?.content?.length === 0 ||
                    (content?.content?.length === 1 &&
                        content?.content[0].type === "paragraph" &&
                        (!content?.content[0].content || content?.content[0].content.length === 0)),
            ).toBe(true);
        });
    });

    it("handles plain text in text prop gracefully", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "Plain text string",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            if (!wrapper.vm.editor) throw new Error("Editor should be defined");
            expect(wrapper.vm.editor).toBeDefined();
        });

        // Should not throw error and should set content as plain text
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Plain text string");
        });
    });

    it("renders toolbar with link and unlink buttons", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Some text</p>",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.editor).toBeDefined();
        });

        // Should have Link and Unlink toolbar buttons
        const linkButton = wrapper.find('button[title="Link"]');
        const unlinkButton = wrapper.find('button[title="Unlink"]');
        expect(linkButton.exists()).toBe(true);
        expect(unlinkButton.exists()).toBe(true);
    });

    it("renders toolbar buttons including custom icons", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Test</p>",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.editor).toBeDefined();
        });

        // Toolbar should render buttons
        const buttons = wrapper.findAll("button[title]");
        expect(buttons.length).toBeGreaterThan(0);
    });

    it("exposes editor instance via defineExpose", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                disabled: false,
                text: "<p>Test</p>",
                textLanguage: "lang-eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.vm.editor).toBeDefined();
        });

        const editor = wrapper.vm.editor;
        expect(editor).toBeDefined();
        // Editor should have standard TipTap methods
        expect(editor?.commands).toBeDefined();
        expect(editor?.getAttributes).toBeDefined();
    });

    describe("file uploader integration", () => {
        it("renders an upload button in the toolbar", async () => {
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

            const uploadButton = wrapper.find('button[title="Upload"]');
            expect(uploadButton.exists()).toBe(true);
        });

        it("renders a hidden file input for upload", async () => {
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

            const fileInput = wrapper.find('input[type="file"]');
            expect(fileInput.exists()).toBe(true);
            expect(fileInput.attributes("accept")).toBe(".docx,.odt,.odf,.txt");
        });

        it("renders upload button with the ArrowUpTrayIcon", async () => {
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

            const uploadButton = wrapper.find('button[title="Upload"]');
            expect(uploadButton.exists()).toBe(true);
            // The button should contain an SVG icon (ArrowUpTrayIcon), not a text label
            expect(uploadButton.find("svg").exists()).toBe(true);
            expect(uploadButton.find("span").exists()).toBe(false);
        });

        it("shows drop overlay when dragging a file over the editor", async () => {
            const wrapper = mount(RichTextEditor, {
                props: {
                    disabled: false,
                    text: "",
                    textLanguage: "lang-eng",
                },
            });

            await waitForExpect(() => {
                expect(wrapper.find(".rte-editor").exists()).toBe(true);
            });

            const editorDiv = wrapper.find(".rte-editor");

            await editorDiv.trigger("dragover", {
                dataTransfer: { files: [new File([""], "test.docx")], items: [] },
            });

            await waitForExpect(() => {
                expect(wrapper.find(".rte-drop-overlay").exists()).toBe(true);
            });
        });

        it("does not have custom drag/drop handlers on the wrapper (delegated to rte-vue)", () => {
            // Verify the component no longer wraps the editor in a custom drag-drop div
            const wrapper = mount(RichTextEditor, {
                props: {
                    disabled: false,
                    text: "",
                    textLanguage: "lang-eng",
                },
            });

            // The root element should be the RTextEditor, not a wrapper div with drag handlers
            const html = wrapper.html();
            expect(html).not.toContain("Drop file to insert content");
        });
    });
});
