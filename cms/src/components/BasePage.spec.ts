import { describe, it, expect, vi } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";
import { ref } from "vue";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "edit" }),
        }),
    };
});

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
            props: { title: "Page title" },
            slots: { default: "Default slot content" },
        });

        expect(wrapper.text()).toContain("Page title");
        expect(wrapper.text()).toContain("Default slot content");
    });

    it("renders the back link", async () => {
        const wrapper = mount(BasePage, {
            props: { backLinkLocation: { name: "posts.index" }, backLinkText: "Posts" },
            global: {
                // Stub out other components that render their own RouterLinks so we only assert on the back link
                stubs: {
                    RouterLink: RouterLinkStub,
                    SideBar: { template: "<div />" },
                    TopBar: {
                        template:
                            '<div><slot name="quickActions" /><slot name="contentActions" /></div>',
                    },
                    MobileSideBar: { template: "<div />" },
                },
            },
        });

        // Now the only RouterLink should be the back link
        const routerLinks = wrapper.findAllComponents(RouterLinkStub);
        expect(routerLinks.length).toBe(1);
        expect(routerLinks[0].props().to).toEqual({ name: "posts.index" });
        expect(wrapper.text()).toContain("Posts");
    });
});
