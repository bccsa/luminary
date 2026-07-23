import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import StartingInterestCard from "./StartingInterestCard.vue";

vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        current: ref({ _id: "default-affinity", memberOf: [], affinity: { "tag-a": 0.4 } }),
        saveAffinity: vi.fn(),
    }),
}));

describe("StartingInterestCard", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the topic label and score", () => {
        const wrapper = mount(StartingInterestCard, {
            props: { tagId: "tag-a", label: "Commentary", score: 0.4, updatedTimeUtc: 1 },
        });

        expect(wrapper.text()).toContain("Commentary");
        expect(wrapper.text()).toContain("40%");
    });

    it("opens the edit modal for this topic when clicked", async () => {
        const wrapper = mount(StartingInterestCard, {
            props: { tagId: "tag-a", label: "Commentary", score: 0.4, updatedTimeUtc: 1 },
        });

        expect(wrapper.findComponent({ name: "EditStartingInterestModal" }).exists()).toBe(false);

        await wrapper.find("[data-test='display-card']").trigger("click");

        expect(wrapper.findComponent({ name: "EditStartingInterestModal" }).exists()).toBe(true);
    });
});
