import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { accessMap } from "luminary-shared";
import RecommendationsPage from "./RecommendationsPage.vue";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "recommendations" }),
        }),
    };
});

vi.mock("@/globalConfig", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

const DEFAULT_AFFINITY_CONFIG = vi.hoisted(() => ({
    tierHalfLifeDays: { core: 120, strong: 60, established: 25, unprotected: 45 },
    tierWeight: { core: 1.0, strong: 0.6, established: 0.3, unprotected: 0.3 },
    hitWeight: 0.04,
    minScore: 0.01,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    eventWeight: {
        bookmark: 0.25,
        bookmarkRemoved: -0.15,
        completion: 0.35,
        readCompletion: 0.35,
        highlight: 0.3,
        highlightRemoved: -0.18,
        impression: -0.02,
    },
}));

vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        current: ref({
            _id: "default-affinity",
            memberOf: ["group-super-admins"],
            affinity: { "tag-a": 0.4, "tag-b": 0.7 },
            config: DEFAULT_AFFINITY_CONFIG,
        }),
        config: ref(DEFAULT_AFFINITY_CONFIG),
        isLoading: ref(false),
        saveAffinity: vi.fn(),
        saveConfig: vi.fn(),
    }),
}));

vi.mock("@/composables/useTopicTagOptions", () => ({
    useTopicTagOptions: () => ({
        tagOptions: ref([
            { id: "tag-a", label: "Commentary" },
            { id: "tag-b", label: "Sports" },
        ]),
        tagLabel: (id: string) => (id === "tag-a" ? "Commentary" : id === "tag-b" ? "Sports" : id),
    }),
}));

describe("RecommendationsPage", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        accessMap.value = {
            "group-super-admins": { defaultAffinity: { edit: true, cmsView: true } },
        } as never;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders a card per starting interest", () => {
        const wrapper = mount(RecommendationsPage);

        expect(wrapper.text()).toContain("Commentary");
        expect(wrapper.text()).toContain("Sports");
    });

    it("filters cards by the search term", async () => {
        const wrapper = mount(RecommendationsPage);

        await wrapper.find("input[type='text']").setValue("comm");

        expect(wrapper.text()).toContain("Commentary");
        expect(wrapper.text()).not.toContain("Sports");
    });

    it("opens the add-interest modal from the top bar", async () => {
        const wrapper = mount(RecommendationsPage);

        expect(wrapper.findComponent({ name: "AddStartingInterestModal" }).exists()).toBe(false);

        await wrapper.find("button[data-test='openAddStartingInterestModal']").trigger("click");

        expect(wrapper.findComponent({ name: "AddStartingInterestModal" }).exists()).toBe(true);
    });

    it("opens the recommendation-settings modal from the top bar", async () => {
        const wrapper = mount(RecommendationsPage);

        expect(wrapper.findComponent({ name: "AffinityConfigModal" }).exists()).toBe(false);

        await wrapper.find("button[data-test='openAffinityConfigModal']").trigger("click");

        expect(wrapper.findComponent({ name: "AffinityConfigModal" }).exists()).toBe(true);
    });
});
