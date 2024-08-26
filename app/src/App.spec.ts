import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { isConnected } from "luminary-shared";
import { useNotificationStore } from "./stores/notification";

vi.mock("@auth0/auth0-vue");

describe("App", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("only gets the token when authenticated", async () => {
        const getAccessTokenSilently = vi.fn();

        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            getAccessTokenSilently,
        });

        mount(App, {
            shallow: true,
        });

        await waitForExpect(() => {
            expect(getAccessTokenSilently).toHaveBeenCalledOnce();
        });
    });

    it("shows the banner when offline", async () => {
        vi.spyOn(isConnected, "value", "get").mockReturnValue(false);

        const notificationStore = useNotificationStore();

        mount(App, {
            shallow: true,
        });

        await waitForExpect(() => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "offlineBanner",
                    title: "You are offline",
                    description:
                        "You can still use the app and browse through offline content, but some content (like videos) might not be available.",
                }),
            );
        });
    });

    it("doesnt show the banner when online", async () => {
        vi.spyOn(isConnected, "value", "get").mockReturnValue(true);

        const notificationStore = useNotificationStore();

        mount(App, {
            shallow: true,
        });

        await waitForExpect(() => {
            expect(notificationStore.removeNotification).toHaveBeenCalledWith("offlineBanner");
        });
    });
});
