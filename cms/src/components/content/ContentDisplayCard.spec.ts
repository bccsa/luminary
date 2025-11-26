import { mount } from "@vue/test-utils";
import { describe } from "node:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ContentDisplayCard from "./ContentDisplayCard.vue";
import { cmsDefaultLanguage, initLanguage } from "@/globalConfig";
import { createTestingPinia } from "@pinia/testing";
import { db, accessMap, DocType } from "luminary-shared";
import { setActivePinia } from "pinia";
import * as mockData from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";

// Monkey patch the router to keep test accurate and avoid false positives
// This also prevents vitest hoisting issues with the router
import * as actualRouter from "@/router";
const mockPush = vi.fn();
Object.defineProperty(actualRouter, "default", {
    value: { push: mockPush },
    writable: true,
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: mockPush,
        }),
    };
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
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
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
        mockPush.mockClear();
    });

    it("routes to default language translation", async () => {
        cmsDefaultLanguage.value = mockData.mockLanguageDtoSwa;

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

        // Wait for component to render - the card should be visible
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockData.mockEnglishContentDto.title);
        });

        // Click on the card (the click handler is on the root DisplayCard element)
        // We can click on the title element or the root card - both should work
        const card = wrapper.find("[data-test='display-card']");
        expect(card.exists()).toBe(true);
        await card.trigger("click");

        await waitForExpect(() => {
            expect(mockPush).toHaveBeenCalledWith({
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
