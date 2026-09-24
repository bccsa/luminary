import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { reactive } from "vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import LibraryPage from "../LibraryPage.vue";

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

describe("LibraryPage", () => {
    beforeEach(() => {
        route.query = {};
        replace.mockClear();
        setActivePinia(createTestingPinia());
    });

    it("shows the three filters and starts on viewed", async () => {
        const wrapper = mount(LibraryPage);

        expect(wrapper.text()).toContain("Viewed");
        expect(wrapper.text()).toContain("Liked");
        expect(wrapper.text()).toContain("Highlighted");
        expect(wrapper.find("[data-test=library-viewed]").exists()).toBe(true);
    });

    it("switches panel when a filter is selected", async () => {
        const wrapper = mount(LibraryPage);

        await wrapper.find("[data-test=library-filter-highlighted]").trigger("click");
        await wrapper.vm.$nextTick();

        expect(replace).toHaveBeenCalledWith({ query: { filter: "highlighted" } });
        expect(wrapper.find("[data-test=library-highlighted]").exists()).toBe(true);
        expect(wrapper.find("[data-test=library-viewed]").exists()).toBe(false);
    });

    it("opens the filter given in the query string", async () => {
        route.query = { filter: "liked" };

        const wrapper = mount(LibraryPage);

        expect(wrapper.find("[data-test=library-liked]").exists()).toBe(true);
    });
});
