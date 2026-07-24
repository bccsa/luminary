import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import waitForExpect from "wait-for-expect";
import { db, type ContentDto } from "luminary-shared";
import { mockEnglishContentDto, mockTopicContentDto } from "@/tests/mockdata";
import BecauseYouReadRow from "./BecauseYouReadRow.vue";
import { useRecommendations } from "@/composables/useRecommendations";

vi.mock("@/composables/useRecommendations", () => ({
    useRecommendations: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            key === "content.because_you_read" ? `Because you read ${params?.tag}` : key,
    }),
}));

describe("BecauseYouReadRow", () => {
    afterEach(async () => {
        await db.docs.clear();
    });

    it("requests the tag-only leg (useFts: false) and labels the row with the strongest tag", async () => {
        const pick = {
            ...mockEnglishContentDto,
            _id: "content-profile-pick",
            parentId: "post-profile-pick",
            title: "Personalized pick",
        } as ContentDto;
        await db.docs.put({
            ...mockTopicContentDto,
            _id: "content-tag-sports",
            parentId: "tag-sports",
            title: "Sports",
        } as ContentDto);
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [pick]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-sports"]),
        });

        const wrapper = mount(BecauseYouReadRow, {
            props: { selectedContent: mockEnglishContentDto, excludeIds: new Set<string>() },
        });

        expect(useRecommendations).toHaveBeenCalledWith(expect.objectContaining({ useFts: false }));
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Because you read Sports");
            expect(wrapper.text()).toContain("Personalized pick");
        });
    });

    it("excludes ids already shown by other rows", async () => {
        const shown = {
            ...mockEnglishContentDto,
            _id: "content-already-shown",
            parentId: "post-already-shown",
        } as ContentDto;
        await db.docs.put({
            ...mockTopicContentDto,
            _id: "content-tag-sports",
            parentId: "tag-sports",
            title: "Sports",
        } as ContentDto);
        vi.mocked(useRecommendations).mockReturnValue({
            recommended: computed(() => [shown]),
            hasTags: computed(() => true),
            topTagIds: computed(() => ["tag-sports"]),
        });

        const wrapper = mount(BecauseYouReadRow, {
            props: { selectedContent: mockEnglishContentDto, excludeIds: new Set([shown._id]) },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Because you read");
        });
    });
});
