import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContent from "./EditContent.vue";
import { DocType, type ContentDto } from "@/types";
import { db } from "@/db/baseDatabase";

describe("EditContent.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra]);

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("save the content", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
                routerBackLink: "",
                backLinkText: "",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to fetch data
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Simulate enabling dirty state
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("New Title");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        expect(saveButton.attributes().disabled).toBeUndefined();

        await saveButton.trigger("click");

        // Wait for the save to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
        expect(savedDoc.title).toBe("New Title");
    });
});
