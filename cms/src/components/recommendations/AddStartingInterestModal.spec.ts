import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { AckStatus } from "luminary-shared";
import AddStartingInterestModal from "./AddStartingInterestModal.vue";
import { useNotificationStore } from "@/stores/notification";

const mockSaveAffinity = vi.fn();
vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        current: ref({
            _id: "default-affinity",
            memberOf: ["group-super-admins"],
            affinity: { "tag-a": 0.4 },
        }),
        saveAffinity: mockSaveAffinity,
    }),
}));

vi.mock("@/composables/useTopicTagOptions", () => ({
    useTopicTagOptions: () => ({
        tagOptions: ref([
            { id: "tag-a", label: "Commentary" },
            { id: "tag-b", label: "Sports" },
        ]),
        tagLabel: (id: string) => id,
    }),
}));

/** Opens the LSelect topic dropdown and clicks the option matching `label`. */
async function selectTopic(wrapper: VueWrapper, label: string) {
    await wrapper.get('[data-test="l-select-trigger"]').trigger("click");
    const items = wrapper.findAll('[name="list-item"]');
    const match = items.find((item) => item.text() === label);
    await match!.trigger("click");
}

describe("AddStartingInterestModal", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        mockSaveAffinity.mockReset();
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("only offers topics not already added", async () => {
        const wrapper = mount(AddStartingInterestModal, { props: { isVisible: true } });

        await wrapper.get('[data-test="l-select-trigger"]').trigger("click");

        expect(wrapper.text()).not.toContain("Commentary");
        expect(wrapper.text()).toContain("Sports");
    });

    it("adds the selected topic at the chosen score", async () => {
        const wrapper = mount(AddStartingInterestModal, { props: { isVisible: true } });

        await selectTopic(wrapper, "Sports");
        await wrapper.find("input[data-test='add-starting-interest-score']").setValue("0.6");
        await wrapper.find("button[data-test='add-starting-interest-save']").trigger("click");
        await flushPromises();

        expect(mockSaveAffinity).toHaveBeenCalledWith(
            { "tag-a": 0.4, "tag-b": 0.6 },
            ["group-super-admins"],
        );
    });

    it("surfaces a rejected save as an error notification", async () => {
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Rejected, message: "Nope" });
        const notificationStore = useNotificationStore();
        const wrapper = mount(AddStartingInterestModal, { props: { isVisible: true } });

        await selectTopic(wrapper, "Sports");
        await wrapper.find("button[data-test='add-starting-interest-save']").trigger("click");
        await flushPromises();

        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Can't save these settings",
                description: "Nope",
                state: "error",
            }),
        );
    });
});
