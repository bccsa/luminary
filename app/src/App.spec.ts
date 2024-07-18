import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";

vi.mock("@auth0/auth0-vue");

describe("App", () => {
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
});
