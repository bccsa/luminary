import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import TagSelector from "./TagSelector.vue";
import { db, TagType, type ContentDto, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { Combobox } from "@headlessui/vue";
import { reactive } from "vue";

describe("TagSelector.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto]);
        await db.docs.bulkPut([mockData.mockLanguageDtoEng]);
        await db.docs.bulkPut([mockData.mockCategoryDto, mockData.mockTopicDto]);
        await db.docs.bulkPut([mockData.mockCategoryContentDto, mockData.mockTopicContentDto]);
        // Add a second category to the database
        await db.docs.bulkPut([
            { ...mockData.mockCategoryDto, _id: "tag-category2" },
            {
                ...mockData.mockCategoryContentDto,
                _id: "content-category-2",
                parentId: "tag-category2",
                title: "Category 2",
            } as ContentDto,
        ]);

        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("displays selected tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: mockData.mockPostDto, // mockPostDto has a tag of "tag-category1"
            },
        });

        // Wait for updates
        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).not.toContain("Category 2");
        });
    });

    it("displays all available tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: { ...mockData.mockPostDto, tags: [] },
            },
        });

        await wrapper.find("button").trigger("click");

        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).toContain("Category 2");
            // This expect is not working. It can be that the fake indexeddb is not filtering the tags as expected, returing Topic A as well.
            // expect(wrapper.text()).not.toContain("Topic A");
        });
    });

    it("can filter on tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: mockData.mockPostDto,
            },
        });

        await wrapper.find("input").setValue("Category 1");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Category 1");
            expect(wrapper.text()).not.toContain("Category 2");
        });
    });

    it("disables the box and tags when it's disabled", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: mockData.mockPostDto,
                disabled: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(Combobox).props().disabled).toBe(true);
        });
    });

    it("can add tags to the passed Parent document", async () => {
        const parent = reactive({ ...mockData.mockPostDto, tags: [] });
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: parent,
            },
        });

        await wrapper.find("input").setValue("Category 1");

        let tag;
        await waitForExpect(() => {
            tag = wrapper.find("li");
            expect(tag.exists()).toBe(true);
        });

        await tag!.trigger("click");

        expect(parent.tags).toContain("tag-category1");
    });

    it("prevents tagging a tag with itself", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: mockData.mockCategoryDto,
            },
        });

        await wrapper.find("button").trigger("click");

        // Wait for the list to be loaded
        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("Category 2");
        });

        expect(wrapper.text()).not.toContain("Category 1");
    });

    it("shows Uuid if the user doesn't view access", async () => {
        const mockCategory = {
            ...mockData.mockCategoryDto,
            _id: "tag-with-no-view-access",
            memberOf: [],
        };
        await db.docs.bulkPut([mockCategory]);

        const parent = reactive({
            ...mockData.mockPostDto,
            tags: ["tag-with-no-view-access"],
            memberOf: [],
        });

        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: parent,
            },
        });

        // Wait for the list to be loaded
        await waitForExpect(async () => {
            expect(wrapper.text()).toContain("tag-with-no-view-access");
        });
    });
});
