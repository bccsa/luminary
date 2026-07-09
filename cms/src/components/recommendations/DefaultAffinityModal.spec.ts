import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import { ref } from "vue";
import { AckStatus, DocType, db, type ContentDto, type DefaultAffinityDto } from "luminary-shared";
import DefaultAffinityModal from "./DefaultAffinityModal.vue";
import { useNotificationStore } from "@/stores/notification";

const defaultAffinityDoc: DefaultAffinityDto = {
    _id: "default-affinity",
    type: DocType.DefaultAffinity,
    updatedTimeUtc: 1,
    memberOf: ["group-super-admins"],
    affinity: {
        "tag-category1": 0.2,
    },
};

const tagContent: ContentDto = {
    _id: "content-tag-category1-eng",
    type: DocType.Content,
    updatedTimeUtc: 1,
    parentId: "tag-category1",
    parentType: DocType.Tag,
    memberOf: ["group-public-content"],
    language: "lang-eng",
    title: "Category One",
    status: "published",
} as ContentDto;

// DefaultAffinity is a non-synced (API-only) doc type, same as AutoGroupMappings — it is never
// read from Dexie, so the modal's data layer (useDefaultAffinity) is mocked here, matching
// useAutoGroupMappings.spec.ts's style. The tag-picker query (useSharedHybridQuery over Content)
// is left real, since Content genuinely is synced in the CMS — seeded below via bulkPut.
const mockSaveAffinity = vi.fn();
vi.mock("@/composables/useDefaultAffinity", () => ({
    useDefaultAffinity: () => ({
        canView: ref(true),
        canEdit: ref(true),
        current: ref(defaultAffinityDoc),
        isLoading: ref(false),
        saveAffinity: mockSaveAffinity,
    }),
}));

describe("DefaultAffinityModal", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        await db.docs.bulkPut([tagContent]);
        mockSaveAffinity.mockReset();
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("edits and saves the default affinity singleton", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(DefaultAffinityModal, {
            props: {
                isVisible: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find("input[data-test='default-affinity-score']").exists()).toBe(true);
        });

        const scoreInput = wrapper.find("input[data-test='default-affinity-score']");
        await scoreInput.setValue("0.75");
        await wrapper.find("button[data-test='default-affinity-save']").trigger("click");
        await flushPromises();

        expect(mockSaveAffinity).toHaveBeenCalledWith(
            { "tag-category1": 0.75 },
            ["group-super-admins"],
        );
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Default affinity saved",
                state: "success",
            }),
        );
    });

    it("surfaces a rejected save as an error notification", async () => {
        mockSaveAffinity.mockResolvedValue({ ack: AckStatus.Rejected, message: "Nope" });
        const notificationStore = useNotificationStore();
        const wrapper = mount(DefaultAffinityModal, {
            props: {
                isVisible: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find("button[data-test='default-affinity-save']").exists()).toBe(true);
        });

        await wrapper.find("button[data-test='default-affinity-save']").trigger("click");
        await flushPromises();

        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Can't save default affinity",
                description: "Nope",
                state: "error",
            }),
        );
    });
});
