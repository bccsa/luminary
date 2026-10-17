import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ref } from "vue";
import { AckStatus } from "luminary-shared";
import GlobalAffinityCard from "./GlobalAffinityCard.vue";
import { useNotificationStore } from "@/stores/notification";

// Filled with real refs inside the mock factory below — `vi.hoisted` runs before the `vue`
// import is initialized, so the refs cannot be created here.
const globalMock = vi.hoisted(
    () =>
        ({}) as {
            affinity: Ref<Record<string, number>>;
            contributionCount: Ref<number>;
            lastUpdatedUtc: Ref<number>;
            isLoading: Ref<boolean>;
        },
);

const mockSaveAffinity = vi.hoisted(() => vi.fn());
const mockAccessibleGroups = vi.hoisted(() => vi.fn());

vi.mock("@/composables/useGlobalAffinity", async () => {
    const { ref } = await import("vue");
    globalMock.affinity = ref<Record<string, number>>({});
    globalMock.contributionCount = ref(0);
    globalMock.lastUpdatedUtc = ref(0);
    globalMock.isLoading = ref(false);
    return { useGlobalAffinity: () => globalMock };
});

vi.mock("@/composables/useDefaultAffinity", async () => {
    const { ref } = await import("vue");
    return {
        useDefaultAffinity: () => ({
            current: ref({ _id: "default-affinity", memberOf: ["group-super-admins"] }),
            saveAffinity: mockSaveAffinity,
        }),
    };
});

vi.mock("@/composables/useTopicTagOptions", () => ({
    useTopicTagOptions: () => ({ tagLabel: (id: string) => `Label ${id}` }),
}));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, getAccessibleGroups: mockAccessibleGroups };
});

describe("GlobalAffinityCard", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        globalMock.affinity.value = {};
        globalMock.contributionCount.value = 0;
        globalMock.lastUpdatedUtc.value = 0;
        globalMock.isLoading.value = false;
        mockSaveAffinity.mockReset();
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Accepted });
        mockAccessibleGroups.mockReturnValue({ defaultAffinity: ["group-super-admins"] });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("explains how to switch contribution on while the aggregate is empty", () => {
        const wrapper = mount(GlobalAffinityCard);

        expect(wrapper.text()).toContain("Contribute");
        expect(wrapper.findAll('[data-test="global-affinity-entry"]')).toHaveLength(0);
    });

    it("lists topics strongest first", () => {
        globalMock.affinity.value = { "tag-a": 0.1, "tag-b": 0.4, "tag-c": 0.2 };
        const wrapper = mount(GlobalAffinityCard);

        const rows = wrapper.findAll('[data-test="global-affinity-entry"]');
        expect(rows).toHaveLength(3);
        expect(rows[0].text()).toContain("tag-b");
        expect(rows[2].text()).toContain("tag-a");
    });

    it("shows each topic relative to the strongest, not as a raw score", () => {
        // Raw community scores are tiny and grow with adoption, so a literal percentage
        // would read as "nobody is interested in anything".
        globalMock.affinity.value = { "tag-a": 0.004, "tag-b": 0.002 };
        const wrapper = mount(GlobalAffinityCard);

        const rows = wrapper.findAll('[data-test="global-affinity-entry"]');
        expect(rows[0].text()).toContain("100%");
        expect(rows[1].text()).toContain("50%");
    });

    it("shows the contribution count", () => {
        globalMock.affinity.value = { "tag-a": 0.4 };
        globalMock.contributionCount.value = 1234;
        const wrapper = mount(GlobalAffinityCard);

        expect(wrapper.find('[data-test="global-affinity-contributions"]').text()).toContain(
            "1,234",
        );
    });

    it("copies the top topics into the starting interests, rescaled to 0-1", async () => {
        globalMock.affinity.value = { "tag-a": 0.004, "tag-b": 0.002 };
        const wrapper = mount(GlobalAffinityCard);

        await wrapper.find('[data-test="global-affinity-use-as-starting"]').trigger("click");
        await flushPromises();

        expect(mockSaveAffinity).toHaveBeenCalledWith({ "tag-a": 1, "tag-b": 0.5 }, [
            "group-super-admins",
        ]);
        expect(useNotificationStore().addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "success" }),
        );
    });

    it("hides the copy action without edit access to the starting interests", () => {
        globalMock.affinity.value = { "tag-a": 0.4 };
        mockAccessibleGroups.mockReturnValue({});
        const wrapper = mount(GlobalAffinityCard);

        expect(wrapper.find('[data-test="global-affinity-use-as-starting"]').exists()).toBe(false);
    });

    it("surfaces a rejected save as an error", async () => {
        globalMock.affinity.value = { "tag-a": 0.4 };
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Rejected, message: "No access" });
        const wrapper = mount(GlobalAffinityCard);

        await wrapper.find('[data-test="global-affinity-use-as-starting"]').trigger("click");
        await flushPromises();

        expect(useNotificationStore().addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ state: "error", description: "No access" }),
        );
    });
});
