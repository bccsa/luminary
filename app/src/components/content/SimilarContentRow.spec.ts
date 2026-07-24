import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import { type ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";
import SimilarContentRow from "./SimilarContentRow.vue";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";

vi.mock("@/composables/useMoreLikeThis", () => ({
    useMoreLikeThis: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (key === "content.similar_title" ? "Similar articles" : key),
    }),
}));

describe("SimilarContentRow", () => {
    it("renders resolved items and emits them for sibling-row dedup", async () => {
        const match = {
            ...mockEnglishContentDto,
            _id: "content-similar-match",
            title: "Similar match",
        } as ContentDto;
        vi.mocked(useMoreLikeThis).mockReturnValue({ similar: computed(() => [match]) });

        const wrapper = mount(SimilarContentRow, {
            props: {
                selectedContent: mockEnglishContentDto,
                tags: [],
                excludeIds: new Set<string>(),
            },
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).toContain("Similar articles");
        expect(wrapper.html()).toContain("Similar match");
        expect(wrapper.emitted("resolved")?.at(-1)).toEqual([[match]]);
    });

    it("drops items already shown elsewhere on the page (excludeIds) and renders nothing", async () => {
        const shown = { ...mockEnglishContentDto, _id: "content-already-shown" } as ContentDto;
        vi.mocked(useMoreLikeThis).mockReturnValue({ similar: computed(() => [shown]) });

        const wrapper = mount(SimilarContentRow, {
            props: {
                selectedContent: mockEnglishContentDto,
                tags: [],
                excludeIds: new Set([shown._id]),
            },
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).not.toContain("Similar articles");
        expect(wrapper.emitted("resolved")?.at(-1)).toEqual([[]]);
    });
});
