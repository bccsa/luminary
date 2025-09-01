import "fake-indexeddb/auto";
import { describe, vi, beforeAll, afterAll, it, expect } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { accessMap, type ContentDto } from "luminary-shared";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import EditContentText from "./EditContentText.vue";
import waitForExpect from "wait-for-expect";

describe("EditContentText.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("display text, when is defined", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentText, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        const mockText = JSON.parse(mockData.mockEnglishContentDto.text!).content[0].content[0]
            .text;

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockText);
        });
    });

    it("updates RichTextEditor language when content prop's language changes (simulating language switch)", async () => {
        const initialContent: ContentDto = {
            ...mockData.mockEnglishContentDto,
            text: JSON.stringify({
                type: "doc",
                content: [
                    { type: "paragraph", content: [{ type: "text", text: "English content" }] },
                ],
            }),
        };

        const updatedContent: ContentDto = {
            ...mockData.mockEnglishContentDto,
            language: "fr",
            text: JSON.stringify({
                type: "doc",
                content: [
                    { type: "paragraph", content: [{ type: "text", text: "French content" }] },
                ],
            }),
        };

        const wrapper = mount(EditContentText, {
            props: {
                disabled: false,
                content: initialContent,
            },
        });

        // Wait for editor to be ready
        await waitForExpect(() => {
            const editorComponent = wrapper.findComponent({ name: "RichTextEditor" });
            expect(editorComponent.exists()).toBe(true);
            expect(editorComponent.vm.editor).toBeDefined();
        });

        const editorComponent = wrapper.findComponent({ name: "RichTextEditor" });
        const editor = editorComponent.vm.editor;

        // Verify initial content
        expect(editor.getText()).toBe("English content");

        // Update content prop (simulating language switch)
        await wrapper.setProps({ content: updatedContent });

        // Wait for the watcher in RichTextEditor to update
        await waitForExpect(() => {
            expect(editor.getText()).toBe("French content");
        });

        // Verify language display
        expect(wrapper.text()).toContain("H2  H3  H4  H5 French content");
    });
});
