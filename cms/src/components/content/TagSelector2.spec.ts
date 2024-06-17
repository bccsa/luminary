import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockCategoryContentDto,
    mockCategoryDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import TagSelector2 from "./TagSelector2.vue";
import { DocType, TagType, type ContentDto, type PostDto, type TagDto } from "@/types";
import { db } from "@/db/baseDatabase";
import waitForExpect from "wait-for-expect";
import { ref } from "vue";

describe("TagSelector2.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng]);
        await db.docs.bulkPut([mockCategoryDto, mockCategoryContentDto]);

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
                parent: mockPostDto,
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));
        await wait();

        // Wait for updates
        await waitForExpect(async () => {
            console.log(wrapper.html());
        });
    });
});
