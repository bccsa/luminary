import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";
import { ref } from "vue";

const mockCurrentRoute = ref({ name: "edit" });
const mockRouterPush = vi.fn();
const mockSmaller = vi.fn(() => false);

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: mockRouterPush,
            currentRoute: mockCurrentRoute,
        }),
    };
});

vi.mock("@vueuse/core", () => ({
    breakpointsTailwind: {},
    useBreakpoints: () => ({
        smaller: mockSmaller,
    }),
}));

beforeEach(() => {
    mockRouterPush.mockClear();
    mockCurrentRoute.value = { name: "edit" };
    mockSmaller.mockReturnValue(false);
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

    describe("handleMobileSidebarToggle", () => {
        it("Pushes the overview route when on edit content page", async () => {
            mockCurrentRoute.value = { name: "edit" };

            const wrapper = mount(BasePage);

            const button = wrapper.find('[data-test="chevron-icon"]');
            await button.trigger("click");

            expect(mockRouterPush).toHaveBeenCalledWith({ name: "overview" });
        });

        it("Pushes the languages route when on language page", async () => {
            mockCurrentRoute.value = { name: "language" };

            const wrapper = mount(BasePage);

            const button = wrapper.find('[data-test="chevron-icon"]');
            await button.trigger("click");

            expect(mockRouterPush).toHaveBeenCalledWith({ name: "languages" });
        });

        it("Opens the mobile sidebar when not on edit content or language page", async () => {
            mockSmaller.mockReturnValue(true);

            mockCurrentRoute.value = { name: "dashboard" };
            const onOpenMobileSidebar = vi.fn();

            const wrapper = mount(BasePage, {
                props: { onOpenMobileSidebar },
            });

            const button = wrapper.find('[data-test="chevron-icon"]');
            await button.trigger("click");

            expect(onOpenMobileSidebar).toHaveBeenCalled();
            expect(mockRouterPush).not.toHaveBeenCalled();
        });
    });
});
