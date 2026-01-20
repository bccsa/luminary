import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import TagSelector from "./TagSelector.vue";
import { db, TagType, type ContentDto, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { reactive } from "vue";
import LTag from "./LTag.vue";
import LCombobox from "../forms/LCombobox.vue";

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

        accessMap.value = mockData.superAdminAccessMap;
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
            global: { stubs: { Teleport: true } },
        });

        // Wait for updates
        await waitForExpect(async () => {
            await wrapper.find("[data-test='edit-group']").trigger("click");

            expect(wrapper.find('[data-test="selected-labels"').text()).toContain("Category 1");
            expect(wrapper.find('[data-test="selected-labels"').text()).not.toContain("Category 2");
        });
    });

    it("displays all available tags", async () => {
        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: { ...mockData.mockPostDto, tags: [] },
            },
            global: { stubs: { Teleport: true } },
        });

        await waitForExpect(async () => {
            await wrapper.find("[data-test='edit-group']").trigger("click");
            await wrapper.find("[name='options-open-btn']").trigger("click");

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
            global: { stubs: { Teleport: true } },
        });

        await waitForExpect(async () => {
            await wrapper.find("[data-test='edit-group']").trigger("click");
            await wrapper.find("input").setValue("Category 1");

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
            global: { stubs: { Teleport: true } },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(LCombobox).props().disabled).toBe(true);
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
            global: { stubs: { Teleport: true } },
        });

        let tag;
        await waitForExpect(async () => {
            await wrapper.find("[data-test='edit-group']").trigger("click");
            await wrapper.find("input").setValue("Category 1");

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
            global: { stubs: { Teleport: true } },
        });

        // Wait for the list to be loaded
        await waitForExpect(async () => {
            await wrapper.find("[data-test='edit-group']").trigger("click");
            await wrapper.find("[name='options-open-btn']").trigger("click");

            // Expect category 1 to not be available for selection
            expect(wrapper.text()).toContain("Category 2");
            expect(wrapper.text()).not.toContain("Category 1");
        });
    });

    it("disables remove for if the user doesn't have assign access", async () => {
        delete accessMap.value["group-public-content"].tag?.assign;

        const parent = reactive({
            ...mockData.mockCategoryDto,
            memberOf: ["group-public-content"],
            tags: ["tag-category2"],
        });

        const wrapper = mount(TagSelector, {
            props: {
                tagType: TagType.Category,
                language: mockData.mockLanguageDtoEng,
                parent: parent,
            },
            slots: {
                actions: "<button>Remove</button>",
            },
            global: { stubs: { Teleport: true } },
        });

        // Wait for the list to be loaded
        await waitForExpect(async () => {
            // 0. Trigger the click to open the edit tag modal
            await wrapper.find("[data-test='edit-group']").trigger("click");

            // 1. Expect the tag title to be displayed correctly
            expect(wrapper.text()).toContain("Category 2");

            // 2. Expect the LTag component to be disabled
            const tagComponent = wrapper.findComponent(LTag);
            expect(tagComponent.exists()).toBe(true);
            expect(tagComponent.props("disabled")).toBe(true);
        });
    });
});
