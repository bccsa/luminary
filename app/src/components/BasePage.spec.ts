import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BasePage from "./BasePage.vue";
import { mount, VueWrapper } from "@vue/test-utils";
import * as auth0 from "@auth0/auth0-vue";
import { ref, nextTick } from "vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import { createPinia, setActivePinia } from "pinia";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import NotificationBannerManager from "@/components/notifications/NotificationBannerManager.vue";

const currentRouteMock = ref({ fullPath: `/` });
const routeReplaceMock = vi.fn();

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

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

vi.mock("@auth0/auth0-vue", () => ({
    useAuth0: () => ({
        isLoading: ref(false),
        isAuthenticated: ref(false),
    }),
}));

describe("BasePage", () => {
    let wrapper: VueWrapper;

    beforeEach(() => {
        const pinia = createPinia();
        setActivePinia(pinia);

        vi.mocked(auth0);

        wrapper = mount(BasePage, {
            global: {
                plugins: [pinia],
            },
        });
    });

    it("shows whether notification is displayed and visible", async () => {
        const notificationStore = useNotificationStore();

        notificationStore.addNotification({
            id: "test",
            title: "Test Title",
            description: "Test Description",
            state: "info",
            type: "banner",
        });

        await nextTick();

        const bannerManager = wrapper.findComponent(NotificationBannerManager);

        await waitForExpect(() => {
            expect(bannerManager.html()).toContain("Test Title");
        });
    });
});
