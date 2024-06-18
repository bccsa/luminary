import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockPostDto,
    mockTopicContentDto,
    mockTopicDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import TagSelector2 from "./TagSelector2.vue";
import { DocType, TagType } from "@/types";
import { db } from "@/db/baseDatabase";
import waitForExpect from "wait-for-expect";
import { Combobox } from "@headlessui/vue";

describe("TagSelector2.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng]);
        await db.docs.bulkPut([mockCategoryDto, mockTopicDto]);
        await db.docs.bulkPut([mockCategoryContentDto, mockTopicContentDto]);

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
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
                language: mockLanguageDtoEng,
                modelValue: mockPostDto,
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));
        await wait();

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
                language: mockLanguageDtoEng,
                modelValue: { ...mockPostDto, tags: ["tag-topicA"] },
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));
        await wait();

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
                language: mockLanguageDtoEng,
                modelValue: mockPostDto,
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));
        await wait();

        await wrapper.find("input").setValue("cat");

        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).not.toContain("Topic A");
    });

    it("emits an event when selecting a tag", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockLanguageDtoEng,
                modelValue: { ...mockPostDto, tags: [] },
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 1000));
        await wait();

        await wrapper.find("input").setValue("cat");
        await wrapper.find("li").trigger("click");

        await waitForExpect(() => {
            const selectEvent: any = wrapper.emitted("select");
            expect(selectEvent).not.toBe(undefined);
        });
    });

    it("emits an event when removing a tag", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockLanguageDtoEng,
                modelValue: mockPostDto,
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 1000));
        await wait();

        await wrapper.find("button[data-test='removeTag']").trigger("click");

        await waitForExpect(() => {
            const removeEvent: any = wrapper.emitted("remove");
            expect(removeEvent).toBe(undefined);
        });
    });

    it("disables the box and tags when it's disabled", async () => {
        const wrapper = mount(TagSelector2, {
            props: {
                docType: DocType.Tag,
                tagType: TagType.Category,
                language: mockLanguageDtoEng,
                modelValue: mockPostDto,
                disabled: true,
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 1000));
        await wait();

        await waitForExpect(() => {
            expect(wrapper.findComponent(Combobox).props().disabled).toBe(true);
        });
    });
});
