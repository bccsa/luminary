import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { AckStatus } from "luminary-shared";
import EditStartingInterestModal from "./EditStartingInterestModal.vue";
import { useNotificationStore } from "@/stores/notification";

const mockSaveAffinity = vi.fn();
vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        current: ref({
            _id: "default-affinity",
            memberOf: ["group-super-admins"],
            affinity: { "tag-a": 0.4, "tag-b": 0.7 },
        }),
        saveAffinity: mockSaveAffinity,
    }),
}));

describe("EditStartingInterestModal", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        mockSaveAffinity.mockReset();
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("saves the edited score, keeping other entries untouched", async () => {
        const wrapper = mount(EditStartingInterestModal, {
            props: { isVisible: true, tagId: "tag-a", label: "Commentary", score: 0.4 },
        });

        await wrapper.find("input[data-test='starting-interest-score']").setValue("0.75");
        await wrapper.find("button[data-test='starting-interest-save']").trigger("click");
        await flushPromises();

        expect(mockSaveAffinity).toHaveBeenCalledWith(
            { "tag-a": 0.75, "tag-b": 0.7 },
            ["group-super-admins"],
        );
    });

    it("removes the entry entirely", async () => {
        const wrapper = mount(EditStartingInterestModal, {
            props: { isVisible: true, tagId: "tag-a", label: "Commentary", score: 0.4 },
        });

        await wrapper.find("button[data-test='starting-interest-remove']").trigger("click");
        await flushPromises();

        expect(mockSaveAffinity).toHaveBeenCalledWith({ "tag-b": 0.7 }, ["group-super-admins"]);
    });

    it("surfaces a rejected save as an error notification", async () => {
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Rejected, message: "Nope" });
        const notificationStore = useNotificationStore();
        const wrapper = mount(EditStartingInterestModal, {
            props: { isVisible: true, tagId: "tag-a", label: "Commentary", score: 0.4 },
        });

        await wrapper.find("button[data-test='starting-interest-save']").trigger("click");
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
