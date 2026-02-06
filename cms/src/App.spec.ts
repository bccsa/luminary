import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { createTestingPinia } from "@pinia/testing";
import LoadingBar from "@/components/LoadingBar.vue";
import { setActivePinia } from "pinia";
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

    it("renders a loading bar when not authenticated", () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            getAccessTokenSilently: vi.fn(),
        });

        const wrapper = mount(App);

        expect(wrapper.findComponent(LoadingBar).exists()).toBe(true);
    });

    it("displays notification when change request fails", async () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            user: ref({ name: "Test User" }),
            logout: vi.fn(),
            getAccessTokenSilently: vi.fn().mockResolvedValue("mockToken"),
        });

        mount(App, {
            global: {
                plugins: [router],
            },
        });

        const socket = getSocket();

        const changeRequestAckHandler = vi.fn((data) => {
            if (data.ack === "rejected") {
                const notificationStore = useNotificationStore();
                notificationStore.addNotification({
                    title: "Saving changes to server failed.",
                    description: `Your recent request to save changes has failed. The changes have been reverted. Error message: ${data.message}`,
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
                "Your recent request to save changes has failed. The changes have been reverted. Error message: Server error",
            state: "error",
            timer: 60000,
        });
    });
});
