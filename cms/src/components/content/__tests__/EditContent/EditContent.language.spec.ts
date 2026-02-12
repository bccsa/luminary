import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import { translatableLanguagesAsRef } from "@/globalConfig";

// Set up mocks before any imports
vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: {
                    name: "edit",
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

import { mount } from "@vue/test-utils";
import { db, DocType, accessMap, type ContentDto, PublishStatus, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import LanguageSelector from "../../LanguageSelector.vue";
import LTextToggle from "../../../forms/LTextToggle.vue";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    translateAccessToAllContentMap,
} from "./EditContent.test-utils";

describe("EditContent - Language & Translations", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("only displays languages the user has Translate access to in languageSelector", async () => {
        await db.docs.clear();

        // Set up access map before inserting docs - this ensures all correct access has
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].language = {
            view: true,
            translate: false,
            edit: true,
            publish: true,
        };

        await db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            { ...mockLanguageDtoEng, memberOf: ["group-languages"] },
            { ...mockLanguageDtoFra, memberOf: ["group-public-content"] },
            { ...mockLanguageDtoSwa, memberOf: ["group-public-content"] },
        ]);

        // Wait for global language list to update based on new DB data and access map
        await waitForExpect(() => {
            expect(translatableLanguagesAsRef.value.length).toBe(1);
            expect(translatableLanguagesAsRef.value[0]._id).toBe(mockLanguageDtoEng._id);
        });

        const wrapper = mount(EditContent, {
            props: {
                id: mockPostDto._id,
                languageCode: "eng",
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for component to load and language selector to appear
        await waitForExpect(() => {
            const languageSelector = wrapper.findComponent(LanguageSelector);
            expect(languageSelector.exists()).toBe(true);
        });

        // Wait for the languages to be filtered correctly
        await waitForExpect(() => {
            const languages = wrapper.find("[data-test='languagePopup']");
            expect(languages.exists()).toBe(true);

            const html = languages.html();
            expect(html).toContain("English");
            expect(html).not.toContain("Français");
            expect(html).not.toContain("Swahili");
        });
    });

    it("should save changes in draft mode with translate access on language and post/tag, without needing publish access", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: false,
        };
        accessMap.value["group-languages"].language = {
            view: true,
            translate: true,
            edit: false,
        };

        // Set content status to Draft (not Published)
        await db.docs.put({
            ...mockEnglishContentDto,
            status: PublishStatus.Draft,
        } as ContentDto);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for data load
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        // Check that the publish button is disabled
        const publishButton = wrapper.findAllComponents(LTextToggle)[1];
        expect(publishButton.exists()).toBe(true);
        expect(publishButton.props().disabled).toBe(true);

        // Update title to make the content dirty
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("Translated Title");

        // Save
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        // Check if content is saved
        await waitForExpect(async () => {
            const saved = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(saved?.title).toBe("Translated Title");
        });
    });
});
