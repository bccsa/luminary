import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { createTestingPinia } from "@pinia/testing";
import LoadingSpinner from "./components/LoadingSpinner.vue";
import { useSocketConnectionStore } from "./stores/socketConnection";
import { setActivePinia } from "pinia";
import { useLocalChangeStore } from "./stores/localChanges";
import waitForExpect from "wait-for-expect";

vi.mock("@auth0/auth0-vue");

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

    it("registers the socket connection events", async () => {
        const socketConnectionStore = useSocketConnectionStore();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            getAccessTokenSilently: vi.fn(),
        });

        mount(App);

        await waitForExpect(() => {
            expect(socketConnectionStore.bindEvents).toHaveBeenCalledOnce();
        });
    });

    it("watches for syncable changes", async () => {
        const localChangeStore = useLocalChangeStore();
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            getAccessTokenSilently: vi.fn(),
        });

        mount(App);

        await waitForExpect(() => {
            expect(localChangeStore.watchForSyncableChanges).toHaveBeenCalledOnce();
        });
    });
});
