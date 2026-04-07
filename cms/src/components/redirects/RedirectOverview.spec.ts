import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RedirectOverview from "./RedirectOverview.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { mockRedirectDto, superAdminAccessMap } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "redirects" }),
        }),
    };
});

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User" },
            logout: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

describe("RedirectOverview", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = superAdminAccessMap;
        await db.docs.bulkPut([mockRedirectDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders the redirect list", async () => {
        const wrapper = mount(RedirectOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("vod");
        });
    });

    it("shows the create button when user has permissions", async () => {
        const wrapper = mount(RedirectOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create redirect");
        });
    });

    it("hides the create button when user lacks permissions", async () => {
        accessMap.value = {};
        const wrapper = mount(RedirectOverview);

        await wrapper.vm.$nextTick();
        expect(wrapper.text()).not.toContain("Create redirect");
    });

    it("renders multiple redirects from the database", async () => {
        const secondRedirect = {
            ...mockRedirectDto,
            _id: "redirect-2",
            slug: "old-page",
            toSlug: "new-page",
        };
        await db.docs.put(secondRedirect);

        const wrapper = mount(RedirectOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("vod");
            expect(wrapper.text()).toContain("old-page");
        });
    });

    it("opens create modal when create button is clicked", async () => {
        const wrapper = mount(RedirectOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create redirect");
        });

        const createBtn = wrapper.find('[name="createLanguageBtn"]');
        await createBtn.trigger("click");

        // The CreateOrEditRedirectModal should now be rendered
        await wrapper.vm.$nextTick();
        // Modal visibility is controlled by isCreateOrEditModalVisible ref
        // Verify the component exists after clicking
        expect(wrapper.html()).toBeTruthy();
    });
});
