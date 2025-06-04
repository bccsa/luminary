import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./SettingsPage.vue";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { db, isConnected, accessMap, init, DocType } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";

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

describe("purgeLocalDatabase", () => {
    beforeAll(async () => {
        await init({
            cms: true,
            docsIndex: "",
            apiUrl: "localhost:3000",
            syncList: [
                {
                    type: DocType.Tag,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Post,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Redirect,
                    syncPriority: 2,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Language,
                    syncPriority: 1,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.Group,
                    syncPriority: 1,
                    skipWaitForLanguageSync: true,
                },
                {
                    type: DocType.User,
                    sync: false,
                },
            ],
        });

        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto, mockData.mockFrenchContentDto]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
            mockData.mockGroupDtoPrivateContent,
            mockData.mockGroupDtoPublicContent,
            mockData.mockGroupDtoPublicEditors,
            mockData.mockGroupDtoPublicUsers,
            mockData.mockGroupDtoSuperAdmins,
        ]);
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto, mockData.mockFrenchContentDto]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;

        cmsLanguageIdAsRef.value = "lang-eng";
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });
    it("purges the local database when connected", async () => {
        const wrapper = mount(SettingsPage);

        isConnected.value = false;

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        waitForExpect(async () => {
            expect((await db.docs.toArray()).length).toBeGreaterThan(0);
        });

        isConnected.value = true;
        await wrapper.vm.$nextTick();

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        waitForExpect(async () => {
            expect((await db.docs.toArray()).length).toBe(0);
            expect(await db.docs.toArray()).toEqual([]);
        });
    });

    it("renders purge local database success notification", async () => {
        const notificationStore = useNotificationStore();

        const wrapper = mount(SettingsPage);

        isConnected.value = false;

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        waitForExpect(() => {
            expect(db.purge).not.toHaveBeenCalled();
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "error" }),
            );
        });

        isConnected.value = true;

        await wrapper.find("button[data-test='deleteLocalDatabase']").trigger("click");

        waitForExpect(() => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "success" }),
            );
        });
    });
});
