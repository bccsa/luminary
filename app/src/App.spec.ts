import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { SignalSlashIcon } from "@heroicons/vue/24/solid";
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
        const addNotification = vi.fn();
        const removeNotification = vi.fn();

        vi.spyOn(isConnected, "value", "get").mockReturnValue(false);
        vi.spyOn(useNotificationStore(), "addNotification").mockImplementation(addNotification);
        vi.spyOn(useNotificationStore(), "removeNotification").mockImplementation(
            removeNotification,
        );

        mount(App, {
            shallow: true,
        });

        // Wait for the setTimeout and watch to trigger
        await waitForExpect(() => {
            expect(addNotification).toHaveBeenCalledWith({
                id: "offlineBanner",
                title: "You are offline",
                description:
                    "You can still use the app and browse through offline content, but some content (like videos) might not be available.",
                state: "warning",
                type: "banner",
                icon: SignalSlashIcon,
            });
        });

        // Now test removing the notification when reconnected
        vi.spyOn(isConnected, "value", "get").mockReturnValue(true);

        // Trigger the watch manually by updating the value
        isConnected.value = true;

        await waitForExpect(() => {
            expect(removeNotification).toHaveBeenCalledWith("offlineBanner");
        });
    }, 10000);
});
