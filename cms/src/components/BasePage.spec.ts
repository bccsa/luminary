import { describe, it, expect, vi } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

describe("BasePage", () => {
    it("renders the title and default slot", async () => {
        const wrapper = mount(BasePage, {
            props: { title: "Page title", shouldShowPageTitle: true },
            slots: { default: "Default slot content" },
        });

        expect(wrapper.text()).toContain("Page title");
        expect(wrapper.text()).toContain("Default slot content");
    });

    it("renders the back link", async () => {
        const wrapper = mount(BasePage, {
            props: {
                backLinkLocation: { name: "posts.index" },
                backLinkText: "Posts",
                loading: false,
            },
            global: {
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
        });

        const routerLink = wrapper.findComponent(RouterLinkStub);
        expect(routerLink.props().to).toEqual({ name: "posts.index" });
        expect(wrapper.text()).toContain("Posts");
    });
});
