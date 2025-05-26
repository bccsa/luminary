import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import BasePage from "./BasePage.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, DocType, PostType } from "luminary-shared";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import waitForExpect from "wait-for-expect";
import { superAdminAccessMap } from "@/tests/mockdata";
import TopBarActions from "./navigation/TopBarActions.vue";

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
        authGuard: vi.fn(), // add this line
    };
});

const mockCurrentRoute = { name: "" };
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            currentRoute: { value: mockCurrentRoute },
        }),
    };
});

describe("BasePage", () => {
    beforeEach(() => {
        mockCurrentRoute.name = "";

        accessMap.value = superAdminAccessMap;
    });

    it("renders the title and default slot", async () => {
        const wrapper = mount(BasePage, {
            props: { title: "Page title" },
            slots: { default: "Default slot content" },
            global: {
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
        });

        expect(wrapper.text()).toContain("Page title");
        expect(wrapper.text()).toContain("Default slot content");
    });

    it("renders the back link", async () => {
        const wrapper = mount(BasePage, {
            props: { backLinkLocation: { name: "posts.index" }, backLinkText: "Posts" },
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

    it("can create content", async () => {
        mockCurrentRoute.name = "overview";

        const wrapper = mount(BasePage, {
            global: {
                plugins: [createTestingPinia()],
                stubs: {
                    RouterLink: RouterLinkStub,
                },
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        // @ts-ignore
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const createButton = wrapper.findComponent(TopBarActions).find("create-button");
            expect(createButton.exists()).toBe(true);
            expect(createButton.text()).toBe("Create post");

            const routerLink = createButton.findComponent(RouterLinkStub);
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.tagOrPostType).toBe("blog");
            expect(linkProps.params?.id).toBe("new");
        });
    });
});
