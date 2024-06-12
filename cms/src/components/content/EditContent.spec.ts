import "fake-indexeddb/auto";
import { describe, it, beforeAll, afterEach, beforeEach, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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
import waitForExpect from "wait-for-expect";
import { DateTime, Settings } from "luxon";

describe("EditContent.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra]);

        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
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
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        // Simulate enabling dirty state
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("New Title");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        expect(saveButton.attributes().disabled).toBeUndefined();

        await saveButton.trigger("click");

        // Wait for the save to complete
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.title).toBe("New Title");
        });
    });

    it("edit the summary", async () => {
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

        await waitForExpect(() => {
            expect(wrapper.find('input[name="summary"]').exists()).toBe(true);
        });

        const summaryInput = wrapper.find("input[name='summary']");
        await summaryInput.setValue("Updated Summary");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        expect(saveButton.attributes().disabled).toBeUndefined();

        await saveButton.trigger("click");

        // Wait for the save to complete
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.summary).toBe("Updated Summary");
        });
    });

    it("sets a default for the publish date when publishing", async () => {
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

        await waitForExpect(() => {
            expect(wrapper.find('input[name="publishDate"]').exists()).toBe(true);
        });

        const publishInput = wrapper.find('input[name="publishDate"]');
        publishInput.setValue(undefined);

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);

        await saveButton.trigger("click");

        // Wait for the publish action to complete
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.publishDate).toBeDefined();
        });
    });

    it("sets expiry date when shortcut buttons are clicked", async () => {
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
        // await waitForExpect(() => {
        //     expect(wrapper.find('input[name="expiryDate"]').exists()).toBe(true);
        // });

        // Simulate setting publish date first
        const publishDate = Date.now();
        await db.docs.update(mockEnglishContentDto._id, { publishDate });

        // Force update to pick up the publish date change
        await wrapper.vm.$nextTick();

        // Click the expiry shortcut button
        const oneButton = wrapper.find('[data-test="1"]');
        const weekButton = wrapper.find('[data-test="W"]');
        await oneButton.trigger("click");
        await weekButton.trigger("click");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);

        await saveButton.trigger("click");

        // Wait for Vue to process the state change
        await wrapper.vm.$nextTick();

        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            console.log(savedDoc);
            expect(savedDoc.expiryDate).not.toBe(undefined);
            expect(savedDoc.expiryDate).toBeGreaterThan(publishDate);
        });
    });
});
