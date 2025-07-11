import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentBasic from "./EditContentBasic.vue";
import { accessMap, type ContentDto } from "luminary-shared";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can update the title", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the title input field
        const titleInput = wrapper.find('[name="title"]');
        await titleInput.setValue("Updated Title");

        // Check if the content's title was updated
        expect(content.value.title).toBe("Updated Title");
    });

    it("can update the author", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the author input field
        const authorInput = wrapper.find('[name="author"]');
        await authorInput.setValue("Updated Author");

        // Check if the content's author was updated
        expect(content.value.author).toBe("Updated Author");
    });

    it("can update the summary", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the summary input field
        const summaryInput = wrapper.find('[name="summary"]');
        await summaryInput.setValue("Updated Summary");

        // Check if the content's summary was updated
        expect(content.value.summary).toBe("Updated Summary");
    });

    it("can update the slug", async () => {
        const content = ref<ContentDto>(mockData.mockEnglishContentDto);
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and update the slug input field
        const slugInput = wrapper.find('[name="slug"]');
        await slugInput.setValue("updated-slug");

        // Check if the content's slug was updated
        expect(content.value.slug).toBe("updated-slug");
    });

    it("can update the seo title", async () => {
        const content = ref<ContentDto>({ ...mockData.mockEnglishContentDto });

        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Find and click the toggle to switch to the SEO tab
        const seoToggle = wrapper.find('[data-test="text-toggle"]');
        const seoToggleBtn = seoToggle.findAll("button")[1];
        await seoToggleBtn.trigger("click");

        // Find and update the SEO title input field
        const seoTitleInput = wrapper.find('input[name="seo-title"]');
        await seoTitleInput.setValue("Updated Seo Title");

        // Assert that the model has been updated
        expect(content.value.seoTitle).toBe("Updated Seo Title");
    });

    it("can update the seo summary", async () => {
        const content = ref<ContentDto>({ ...mockData.mockEnglishContentDto });

        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                content: content.value,
            },
        });

        // Switch to the SEO tab
        const seoToggle = wrapper.find('[data-test="text-toggle"]');
        const seoToggleBtn = seoToggle.findAll("button")[1];
        await seoToggleBtn.trigger("click");

        // Find and update the SEO summary input field
        const seoSummaryInput = wrapper.find('input[name="seo-summary"]');
        await seoSummaryInput.setValue("Updated Seo Summary");

        expect(content.value.seoString).toBe("Updated Seo Summary");
    });
});
