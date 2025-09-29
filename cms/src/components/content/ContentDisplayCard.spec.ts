import { mount } from "@vue/test-utils";
import { describe } from "node:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ContentDisplayCard from "./ContentDisplayCard.vue";
import { cmsDefaultLanguage, initLanguage } from "@/globalConfig";
import { createTestingPinia } from "@pinia/testing";
import { db, accessMap, DocType, type LanguageDto } from "luminary-shared";
import { setActivePinia } from "pinia";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";

// Monkey patch the router to keep test accurate and avoid false positives
// This also prevents vitest hoisting issues with the router
import * as actualRouter from "@/router";
Object.defineProperty(actualRouter, "default", {
    value: { push: vi.fn() },
    writable: true,
});

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

describe("ContentDisplayCard", () => {
    beforeEach(async () => {
        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());
        await db.docs.clear();
        await db.localChanges.clear();

        // seed the fake indexDB with mock data
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([
            mockData.mockEnglishContentDto,
            mockData.mockFrenchContentDto,
            mockData.mockSwahiliContentDto,
            mockData.mockPostDto,
        ]);
        await db.docs.bulkPut([
            { ...mockData.mockLanguageDtoEng, default: 0 } as LanguageDto,
            { ...mockData.mockLanguageDtoFra, default: 0 } as LanguageDto,
            { ...mockData.mockLanguageDtoSwa, default: 1 } as LanguageDto,
        ]);

        await db.docs.bulkPut([
            mockData.mockGroupDtoSuperAdmins,
            mockData.mockGroupDtoPublicUsers,
            mockData.mockGroupDtoPublicContent,
            mockData.mockGroupDtoPrivateContent,
        ]);

        accessMap.value = { ...mockData.superAdminAccessMap };
        initLanguage();
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
        vi.clearAllMocks();
    });

    it("routes to default language translation", async () => {
        cmsDefaultLanguage.value = mockData.mockLanguageDtoSwa;

        const push = (actualRouter.default as any).push;

        const wrapper = mount(ContentDisplayCard, {
            props: {
                groups: [
                    mockData.mockGroupDtoSuperAdmins,
                    mockData.mockGroupDtoPublicUsers,
                    mockData.mockGroupDtoPublicContent,
                    mockData.mockGroupDtoPrivateContent,
                ],
                contentDoc: mockData.mockEnglishContentDto,
                parentType: mockData.mockEnglishContentDto.parentType as DocType.Post | DocType.Tag,
                languageId: mockData.mockLanguageDtoEng._id,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
            },
        });

        const title = wrapper.find("[data-test='content-title']");

        await title.trigger("click");

        await waitForExpect(() => {
            expect(push).toHaveBeenCalledWith({
                name: "edit",
                params: {
                    docType: DocType.Post,
                    languageCode: cmsDefaultLanguage.value?.languageCode,
                    id: mockData.mockEnglishContentDto.parentId,
                    tagOrPostType: mockData.mockPostDto.postType,
                },
            });
        });
    });
});
