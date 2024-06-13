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
    mockLanguageDtoSwa,
    mockLocalChange1,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContent from "./EditContent.vue";
import { DocType, type ContentDto } from "@/types";
import { db } from "@/db/baseDatabase";
import waitForExpect from "wait-for-expect";

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
        });

        const wait = () => new Promise((resolve) => setTimeout(resolve, 2000));

        await waitForExpect(async () => {
            expect(wrapper.find("button[data-test='language-selector']").exists()).toBe(true);
            await wrapper.find("button[data-test='language-selector']").trigger("click");
            expect(wrapper.find("button[data-test='select-language-swa']").exists()).toBe(true);
            await wrapper.find("button[data-test='select-language-swa']").trigger("click");
        });
        await wait();

        // Wait for the new language to load
        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Translation for Swahili");
        });
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
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.find('[data-test="language-selector"]').exists()).toBe(true); // LanguageSelector is rendered
            expect(wrapper.find('input[name="title"]').exists()).toBe(true); // EditContentBasic is rendered
            expect(wrapper.html()).toContain("Text content"); // EditContentText is rendered
            expect(wrapper.html()).toContain("Video"); // EditContentVideo is rendered
            expect(wrapper.find('button[data-test="save-button"]').exists()).toBe(true); // EditContentParentValidation is rendered
        });
    });

    it("renders the title of the default language", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
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
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });
    });

    it("can detect a local change", async () => {
        await db.localChanges.put(mockLocalChange1);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Offline changes");
        });
    });
});
