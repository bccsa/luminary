import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { db, mockData } from "luminary-shared";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import TagSelector2 from "./TagSelector2.vue";
import { DocType, TagType } from "@/types";
import waitForExpect from "wait-for-expect";
import { Combobox } from "@headlessui/vue";

describe("TagSelector2.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto]);
        await db.docs.bulkPut([mockData.mockLanguageDtoEng]);
        await db.docs.bulkPut([mockData.mockCategoryDto, mockData.mockTopicDto]);
        await db.docs.bulkPut([mockData.mockCategoryContentDto, mockData.mockTopicContentDto]);

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = mockData.fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("displays selected tags", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                modelValue: mockData.mockPostDto,
            },
        });

        // Wait for updates
        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).not.toContain("Topic A");
        });
    });

    it("displays all available tags", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                modelValue: { ...mockData.mockPostDto, tags: ["tag-topicA"] },
            },
        });

        await wrapper.find("button").trigger("click");

        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).toContain("Topic A");
        });
    });

    it("can filter on tags", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                modelValue: mockData.mockPostDto,
            },
        });

        await wrapper.find("input").setValue("cat");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).not.toContain("Topic A");
        });
    });

    it("disables the box and tags when it's disabled", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                modelValue: mockData.mockPostDto,
                disabled: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(Combobox).props().disabled).toBe(true);
        });
    });

    it("can add tags to the passed Parent document", async () => {
        const parent = { ...mockData.mockPostDto, tags: [] };
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                modelValue: parent,
            },
        });

        await wrapper.find("input").setValue("Category 1");

        // wait for the tag element to be loaded
        let tag;
        await waitForExpect(() => {
            tag = wrapper.find("li");
            expect(tag.exists()).toBe(true);
        });

        await tag!.trigger("click");

        expect(parent.tags).toContain("tag-category1");
    });
});
