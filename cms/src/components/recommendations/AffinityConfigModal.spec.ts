import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { AckStatus } from "luminary-shared";
import AffinityConfigModal from "./AffinityConfigModal.vue";
import { useNotificationStore } from "@/stores/notification";

const DEFAULT_AFFINITY_CONFIG = {
    halfLifeDays: 45,
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
};

const mockSaveConfig = vi.fn();
vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        current: ref({
            _id: "default-affinity",
            memberOf: ["group-super-admins"],
            affinity: {},
            config: DEFAULT_AFFINITY_CONFIG,
        }),
        config: ref(DEFAULT_AFFINITY_CONFIG),
        saveConfig: mockSaveConfig,
    }),
}));

describe("AffinityConfigModal", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        mockSaveConfig.mockReset();
        mockSaveConfig.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("saves an edited value clamped into range", async () => {
        const wrapper = mount(AffinityConfigModal, { props: { isVisible: true } });

        const input = wrapper.find("input[name='hitWeight']");
        await input.setValue("5");
        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(mockSaveConfig).toHaveBeenCalledWith(
            expect.objectContaining({ hitWeight: 1 }),
            ["group-super-admins"],
        );
    });

    it("shows a success notification and closes on save", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(AffinityConfigModal, { props: { isVisible: true } });

        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
        await flushPromises();

        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Settings saved", state: "success" }),
        );
    });

    it("surfaces a rejected save as an error notification", async () => {
        mockSaveConfig.mockResolvedValue({ ack: AckStatus.Rejected, message: "Nope" });
        const notificationStore = useNotificationStore();
        const wrapper = mount(AffinityConfigModal, { props: { isVisible: true } });

        await wrapper.find("button[data-test='affinity-config-save']").trigger("click");
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
