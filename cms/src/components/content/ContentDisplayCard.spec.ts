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

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
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
        // globalConfig.initLanguage() keeps cmsDefaultLanguage synced to the default (default===1)
        // language, so forcing a non-default value here would be reactively overwritten — a race
        // that flakes under full-suite load. Seed Swahili AS the default instead: the watcher
        // converges cmsDefaultLanguage to it deterministically, while props.languageId stays
        // English, so the test still proves the card routes by cmsDefaultLanguage, not languageId.
        const swaDefault = { ...mockData.mockLanguageDtoSwa, default: 1 };
        const engNonDefault = { ...mockData.mockLanguageDtoEng, default: 0 };
        await db.docs.bulkPut([swaDefault, engNonDefault]);

        await waitForExpect(() => {
            expect(cmsDefaultLanguage.value?._id).toBe(swaDefault._id);
        });

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
                languageId: engNonDefault._id,
                languages: [engNonDefault, mockData.mockLanguageDtoFra, swaDefault],
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
                    languageCode: swaDefault.languageCode,
                    id: mockData.mockEnglishContentDto.parentId,
                    tagOrPostType: mockData.mockPostDto.postType,
                },
            });
        });
    });
});
