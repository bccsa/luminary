import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { DocType, type ContentDto, accessMap } from "luminary-shared";
import { luminary } from "@/main";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContent from "./EditContent.vue";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            currentRoute: {
                value: {
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
    };
});

describe("EditContent.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        await luminary.db.docs.bulkPut([mockData.mockPostDto]);
        await luminary.db.docs.bulkPut([mockData.mockEnglishContentDto, mockData.mockFrenchContentDto]);
        await luminary.db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await luminary.db.docs.clear();
        await luminary.db.localChanges.clear();
    });

    it("can load content from the database", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
            },
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("can save content to the database", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
            const savedDoc = await luminary.db.get<ContentDto>(mockData.mockEnglishContentDto._id);
            expect(savedDoc.title).toBe("New Title");
        });
    });

    it("renders an initial loading state", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
            },
        });

        expect(wrapper.html()).toContain("Loading...");
    });

    it("renders an empty state when no language is selected", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("The content is not yet available in");
        });
    });

    it("renders all the components", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
                id: mockData.mockPostDto._id,
                languageCode: "eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("can set the language from the route / prop params", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "fra",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockData.mockFrenchContentDto.title);
        });
    });

    it("can detect a local change", async () => {
        await luminary.db.localChanges.put(mockData.mockLocalChange1);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Offline changes");
        });
    });
});
