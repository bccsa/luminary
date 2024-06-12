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
    mockLanguageDtoSwa,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContent from "./EditContent.vue";
import { DocType, type ContentDto } from "@/types";
import { db } from "@/db/baseDatabase";
import waitForExpect from "wait-for-expect";
import { DateTime, Settings } from "luxon";
import { set } from "@vueuse/core";

describe("EditContent.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);

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

    it("can load content from the database", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockEnglishContentDto.title);
        });
    });

    it("can save content to the database", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
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

    it("can create a translation", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));

        await waitForExpect(async () => {
            expect(wrapper.find("button[data-test='language-selector']").exists()).toBe(true);
            await wrapper.find("button[data-test='language-selector']").trigger("click");
            await wrapper.find("button[data-test='select-language-swa']").trigger("click");
        });
        await wait();
        console.log(wrapper.html());

        // TODO: Johan to finish this test

        // Wait for the new language to load
        // await waitForExpect(() => {
        //     expect(wrapper.html()).toContain("Translation for Swahlili");
        // });
    });

    it.skip("renders an initial loading state", async () => {
        // TODO: Add test after loading state is implemented
    });

    it.skip("renders an empty state when there is no content in the post", async () => {
        // TODO: Add test after empty state is implemented
    });

    it("renders all the components", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true); // EditContentBasic is rendered
            // TODO: Johan to finish this test
            // expect(wrapper.find('input[name="image"]').exists()).toBe(true); // EditContentParent is rendered
            // expect(wrapper.find('input[name="content"]').exists()).toBe(true);
        });
    });

    it("renders the title of the default language", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("renders a different language than the selected (route/prop) language when it's not available", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "swa",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("can set the language from the route / prop params", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "fra",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });
    });

    // This test should be in EditContentBasic.spec.ts
    it.skip("edit the summary", async () => {
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

    // Move to EditContentBasic.spec.ts
    it.skip("sets expiry date when shortcut buttons are clicked", async () => {
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
            // console.log(savedDoc);
            expect(savedDoc.expiryDate).not.toBe(undefined);
            expect(savedDoc.expiryDate).toBeGreaterThan(publishDate);
        });
    });
});
