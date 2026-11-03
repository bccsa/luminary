import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { reactive } from "vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import ActivityPage from "../ActivityPage.vue";

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const replace = vi.fn((to: { query: Record<string, string> }) => {
    route.query = to.query;
});

vi.mock("vue-router", () => ({
    useRoute: () => route,
    useRouter: () => ({ replace }),
}));
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
    }),
}));

describe("ActivityPage", () => {
    beforeEach(() => {
        route.query = {};
        replace.mockClear();
        setActivePinia(createTestingPinia());
    });

    it("shows the four filters and starts on all", async () => {
        const wrapper = mount(ActivityPage);

        expect(wrapper.text()).toContain("All");
        expect(wrapper.text()).toContain("Viewed");
        expect(wrapper.text()).toContain("Liked");
        expect(wrapper.text()).toContain("Highlighted");
        expect(wrapper.find("[data-test=activity-all]").exists()).toBe(true);
    });

    it("offers a way back", async () => {
        const wrapper = mount(ActivityPage);

        expect(wrapper.find("[data-test=backButton]").exists()).toBe(true);
    });

    it("switches panel when a filter is selected", async () => {
        const wrapper = mount(ActivityPage);

        await wrapper.find("[data-test=activity-filter-highlighted]").trigger("click");
        await wrapper.vm.$nextTick();

        expect(replace).toHaveBeenCalledWith({ query: { filter: "highlighted" } });
        expect(wrapper.find("[data-test=activity-highlighted]").exists()).toBe(true);
        expect(wrapper.find("[data-test=activity-all]").exists()).toBe(false);
    });

    it("opens the filter given in the query string", async () => {
        route.query = { filter: "liked" };

        const wrapper = mount(ActivityPage);

        expect(wrapper.find("[data-test=activity-liked]").exists()).toBe(true);
    });
});
