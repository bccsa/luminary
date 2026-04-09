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

    it("focuses main element on ArrowDown keypress", async () => {
        const mainEl = wrapper.find("main");
        const focusSpy = vi.spyOn(mainEl.element, "focus");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

        expect(focusSpy).toHaveBeenCalled();
    });

    it("focuses main element on ArrowUp keypress", async () => {
        const mainEl = wrapper.find("main");
        const focusSpy = vi.spyOn(mainEl.element, "focus");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));

        expect(focusSpy).toHaveBeenCalled();
    });

    it("does not focus main element on other key presses", async () => {
        const mainEl = wrapper.find("main");
        const focusSpy = vi.spyOn(mainEl.element, "focus");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        expect(focusSpy).not.toHaveBeenCalled();
    });

    it("removes keydown listener on unmount", () => {
        const removeEventSpy = vi.spyOn(document, "removeEventListener");
        wrapper.unmount();
        expect(removeEventSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
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
            expect(wrapper.html()).toContain("Test Description");
        });
    });
});
