import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { AclPermission, db, DocType, type AuthProviderDto, type GroupDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import FormModal from "./FormModal.vue";

const groupDoc = (_id: string, acl: GroupDto["acl"]) =>
    ({ ...mockData.mockGroupDtoPublicContent, _id, name: _id, acl }) as GroupDto;

const provider = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    memberOf: ["group-public-content"],
    updatedTimeUtc: 1,
    imageBucketId: mockData.mockStorageDtoWithEncryptedCredentials._id,
    imageData: {
        fileCollections: [
            { aspectRatio: 1, imageFiles: [{ width: 1, height: 1, filename: "a.webp" }] },
        ],
    },
} as unknown as AuthProviderDto;

const mountModal = () =>
    mount(FormModal, {
        props: {
            isVisible: true,
            provider,
            isEditing: true,
            isLoading: false,
            errors: undefined,
            availableGroups: [],
            canEdit: true,
            canDelete: true,
            providerIsEdited: false,
        },
        global: { stubs: { teleport: true } },
    });

describe("authProvider FormModal icon bucket access", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });
    afterEach(async () => {
        await db.docs.clear();
    });

    const seed = async (contentAcl: GroupDto["acl"]) =>
        db.docs.bulkPut([
            groupDoc("group-public-content", contentAcl),
            groupDoc("group-public-users", []),
            mockData.mockStorageDtoWithEncryptedCredentials,
        ]);

    const viewProviders = {
        type: DocType.AuthProvider,
        groupId: "group-public-users",
        permission: [AclPermission.View],
    };

    it("warns when a group that can see the provider cannot read its icon bucket", async () => {
        await seed([viewProviders]);

        const wrapper = mountModal();

        await waitForExpect(() => {
            expect(wrapper.find('[data-test="icon-access-banner"]').exists()).toBe(true);
        });
    });

    it("clears once that group is given View on the bucket's group", async () => {
        await seed([viewProviders]);
        const wrapper = mountModal();
        await waitForExpect(() => {
            expect(wrapper.find('[data-test="icon-access-banner"]').exists()).toBe(true);
        });

        await db.docs.put({
            // A real edit carries a newer timestamp, which is what lets it replace the cached doc.
            ...groupDoc("group-public-content", [
                viewProviders,
                { ...viewProviders, type: DocType.Storage },
            ]),
            updatedTimeUtc: 2,
        });

        await waitForExpect(() => {
            expect(wrapper.find('[data-test="icon-access-banner"]').exists()).toBe(false);
        });
    });
});
