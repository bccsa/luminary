import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import RecommendedForYou from "../RecommendedForYou.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

const recommended = ref([mockEnglishContentDto]);
vi.mock("@/composables/useRecommendations", () => ({
    useRecommendations: () => ({ recommended }),
}));

vi.mock("@/composables/useImpressionTracking", () => ({
    useImpressionTracking: () => ({ root: ref(null), onContainerClick: vi.fn() }),
}));

describe("RecommendedForYou", () => {
    it("renders the recommendations as vertical tiles", () => {
        const wrapper = mount(RecommendedForYou);

        const collection = wrapper.findComponent(HorizontalContentTileCollection);
        expect(collection.props().useVerticalTileLayout).toBe(true);
        expect(collection.props().contentDocs).toEqual([mockEnglishContentDto]);
    });

    it("renders nothing when there are no recommendations", () => {
        recommended.value = [];

        const wrapper = mount(RecommendedForYou);

        expect(wrapper.findComponent(HorizontalContentTileCollection).exists()).toBe(false);

        recommended.value = [mockEnglishContentDto];
    });
});
