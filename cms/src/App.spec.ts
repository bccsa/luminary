import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { createTestingPinia } from "@pinia/testing";
import LoadingSpinner from "./components/LoadingSpinner.vue";
import { setActivePinia } from "pinia";
import waitForExpect from "wait-for-expect";
import { getSocket } from "luminary-shared";
import { useNotificationStore } from "./stores/notification";
import { router } from "./router";

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as Object),
        useAuth0: vi.fn(),
    };
});

const addNotification = vi.fn();
vi.mock("./stores/notification", () => ({
    useNotificationStore: vi.fn(() => ({
        addNotification,
    })),
}));

describe("App", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders a loading spinner when not authenticated", () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            getAccessTokenSilently: vi.fn(),
        });

        const wrapper = mount(App);

        expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true);
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

    it("displays notification when change request fails", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            getAccessTokenSilently: vi.fn().mockResolvedValue("mockToken"),
        });

        mount(App, {
            global: {
                plugins: [router],
            },
        });

        await waitForExpect(() => {
            const socket = getSocket({
                apiUrl: "test",
                cms: true,
                token: "test-token",
            });

            const changeRequestAckHandler = vi.fn((data) => {
                if (data.ack === "rejected") {
                    const notificationStore = useNotificationStore();
                    notificationStore.addNotification({
                        title: "Saving changes to server failed.",
                        description: `Your recent request to save changes has failed. The changes have been reverted, both in your CMS and on the server. Error message: ${data.message}`,
                        state: "error",
                        timer: 60000,
                    });
                }
            });

            socket.on("changeRequestAck", changeRequestAckHandler);
            changeRequestAckHandler({
                ack: "rejected",
                message: "Server error",
            });

            expect(addNotification).toHaveBeenCalledWith({
                title: "Saving changes to server failed.",
                description:
                    "Your recent request to save changes has failed. The changes have been reverted, both in your CMS and on the server. Error message: Server error",
                state: "error",
                timer: 60000,
            });
        });
    });
});
