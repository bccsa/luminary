import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SideBar from "./SideBar.vue";
import { accessMap } from "luminary-shared";
import { superAdminAccessMap } from "@/tests/mockdata";

// Hoisted so the auth mocks below can expose them and the tests can assert on them.
const { logoutMock, clearAuth0CacheMock } = vi.hoisted(() => ({
    logoutMock: vi.fn(),
    clearAuth0CacheMock: vi.fn(),
}));

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
        cmsLanguageIdAsRef: ref(""),
        sidebarSectionExpanded: ref({ posts: false, tags: false, access: false }),
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
            logout: logoutMock,
            isAuthenticated: ref(true),
            isLoading: ref(false),
        }),
    };
});

vi.mock("@/auth", () => ({
    isAuthBypassed: false,
    isAuthPluginInstalled: { value: true },
    clearAuth0Cache: clearAuth0CacheMock,
}));

// The footer language row + LanguageModal both read the language list via useHybridQuery; stub it so
// the component renders without hitting Dexie. accessMap / hasAnyPermission stay real (importOriginal).
vi.mock("luminary-shared", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useHybridQuery: () => ref([]),
    };
});

describe("SideBar", () => {
    beforeEach(() => {
        accessMap.value = superAdminAccessMap;
        logoutMock.mockClear();
        clearAuth0CacheMock.mockClear();
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

        const postsButton = wrapper.findAll("button").find((b) => b.text().includes("Posts"));
        expect(postsButton).toBeDefined();

        await postsButton!.trigger("click");

        // After click, the children list should be visible. Check for a PostType entry like "Blog".
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

    it("surfaces the former dropdown items (Language, Settings, Sign out) inline", () => {
        const wrapper = mount(SideBar);
        expect(wrapper.text()).toContain("Language");
        expect(wrapper.text()).toContain("Settings");
        expect(wrapper.text()).toContain("Sign out");
    });

    it("hides the Sandbox link when not in dev mode", () => {
        const wrapper = mount(SideBar);
        expect(wrapper.text()).not.toContain("Sandbox");
    });

    it("closes the mobile drawer when a navigation link is clicked", async () => {
        const wrapper = mount(SideBar, { props: { open: true } });

        const dashboardLink = wrapper.findAll("a").find((a) => a.text().includes("Dashboard"));
        expect(dashboardLink).toBeDefined();

        await dashboardLink!.trigger("click");
        expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    });

    it("renders a backdrop when open and closes the drawer when it is clicked", async () => {
        const wrapper = mount(SideBar, { props: { open: true } });

        const backdrop = wrapper.find("[data-test='mobile-sidebar-backdrop']");
        expect(backdrop.exists()).toBe(true);

        await backdrop.trigger("click");
        expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    });

    it("does not render the backdrop when closed", () => {
        const wrapper = mount(SideBar, { props: { open: false } });
        expect(wrapper.find("[data-test='mobile-sidebar-backdrop']").exists()).toBe(false);
    });

    it("confirms via a dialog before signing out", async () => {
        const wrapper = mount(SideBar);

        await wrapper.find("[data-test='sign-out']").trigger("click");
        await flushPromises();

        const confirmButton = wrapper.find("[data-test='modal-primary-button']");
        expect(confirmButton.exists()).toBe(true);

        await confirmButton.trigger("click");
        expect(clearAuth0CacheMock).toHaveBeenCalled();
        expect(logoutMock).toHaveBeenCalled();
    });
});
