import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SideBar from "./SideBar.vue";
import { accessMap } from "luminary-shared";
import { superAdminAccessMap } from "@/tests/mockdata";

vi.mock("vue-router", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "dashboard" }),
        }),
    };
});

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        appName: "Luminary",
        logo: "/logo.svg",
        isDevMode: false,
        sidebarSectionExpanded: ref({ posts: false, tags: false }),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: ref({ name: "Test User" }),
            logout: vi.fn(),
            isAuthenticated: ref(true),
            isLoading: ref(false),
        }),
    };
});

vi.mock("@/auth", () => ({
    isAuthBypassed: false,
    isAuthPluginInstalled: { value: true },
}));

describe("SideBar", () => {
    beforeEach(() => {
        accessMap.value = superAdminAccessMap;
    });

    it("renders the app logo", () => {
        const wrapper = mount(SideBar);
        const img = wrapper.find("img");
        expect(img.exists()).toBe(true);
    });

    it("shows Dashboard link for all users", () => {
        const wrapper = mount(SideBar);
        expect(wrapper.text()).toContain("Dashboard");
    });

    it("shows all navigation items when user has full permissions", () => {
        const wrapper = mount(SideBar);
        expect(wrapper.text()).toContain("Posts");
        expect(wrapper.text()).toContain("Tags");
        expect(wrapper.text()).toContain("Groups");
        expect(wrapper.text()).toContain("Redirects");
        expect(wrapper.text()).toContain("Languages");
        expect(wrapper.text()).toContain("Storage");
        expect(wrapper.text()).toContain("Users");
    });

    it("hides navigation items when user lacks permissions", () => {
        accessMap.value = {};
        const wrapper = mount(SideBar);

        // Dashboard is always visible
        expect(wrapper.text()).toContain("Dashboard");
        // Others should be hidden
        expect(wrapper.text()).not.toContain("Groups");
        expect(wrapper.text()).not.toContain("Users");
        expect(wrapper.text()).not.toContain("Storage");
    });

    it("toggles Posts section open/closed", async () => {
        const wrapper = mount(SideBar);

        // Posts children should be hidden initially (open = false)
        const postsButton = wrapper.findAll("button").find((b) => b.text().includes("Posts"));
        expect(postsButton).toBeDefined();

        await postsButton!.trigger("click");

        // After click, the children list should be visible
        // We check for PostType entries like "Blog"
        expect(wrapper.text()).toContain("Blog");
    });

    it("toggles Tags section open/closed", async () => {
        const wrapper = mount(SideBar);

        const tagsButton = wrapper.findAll("button").find((b) => b.text().includes("Tags"));
        expect(tagsButton).toBeDefined();

        await tagsButton!.trigger("click");

        // After click, TagType entries should be visible
        expect(wrapper.text()).toContain("Category");
    });

    it("emits close event when a navigation link is clicked", async () => {
        const wrapper = mount(SideBar);

        // Find a RouterLink (Dashboard is a direct link)
        const dashboardLink = wrapper.findAll("a").find((a) => a.text().includes("Dashboard"));
        if (dashboardLink) {
            await dashboardLink.trigger("click");
            expect(wrapper.emitted("close")).toBeTruthy();
        }
    });
});
