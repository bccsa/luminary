import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BasePage from "./BasePage.vue";
import { mount } from "@vue/test-utils";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import NotificationBannerManager from "@/components/notifications/NotificationBannerManager.vue";

const currentRouteMock = ref({ fullPath: `/` });
const routeReplaceMock = vi.fn();

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("BasePage", () => {
    // Define mock functions for use in vue-router mock

    beforeEach(() => {
        setActivePinia(createTestingPinia());

        vi.mock("@auth0/auth0-vue");

        vi.mock("vue-router", async (importOriginal) => {
            const actual = await importOriginal();
            return {
                // @ts-expect-error
                ...actual,
                useRouter: vi.fn().mockImplementation(() => ({
                    currentRoute: currentRouteMock,
                    replace: routeReplaceMock,
                })),
            };
        });
    });

    it("shows whether notification are displayed and visible", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(false),
        });

        const notificationStore = useNotificationStore();

        const wrapper = mount(BasePage, {});

        notificationStore.addNotification({
            id: "test",
            title: "Test Title",
            description: "Test Description",
            state: "info",
            type: "banner",
        });

        const bannerManager = wrapper.findComponent(NotificationBannerManager);

        await waitForExpect(() => {
            expect(bannerManager.html()).toContain("Test Title");
        });

        await waitForExpect(() => {
            //expect(wrapper.find("NotificationBannerManager").exists()).toBe(true);
            console.log(bannerManager.html());

            expect(notificationStore.addNotification).toHaveBeenCalledWith({
                id: "test",
                title: "Test Title",
                description: "Test Description",
                state: "info",
                type: "banner",
            });
        });
    });
}, 20000);
