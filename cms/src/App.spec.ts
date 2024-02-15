import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { createTestingPinia } from "@pinia/testing";
import LoadingSpinner from "./components/LoadingSpinner.vue";
import { useSocketConnectionStore } from "./stores/socketConnection";
import { setActivePinia } from "pinia";

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
            isAuthenticated: ref(false),
        });

        const wrapper = mount(App);

        expect(wrapper.findComponent(LoadingSpinner).exists()).toBe(true);
    });

    it("registers the socket connection events", () => {
        const socketConnectionStore = useSocketConnectionStore();

        mount(App);

        expect(socketConnectionStore.bindEvents).toHaveBeenCalledOnce();
    });
});
