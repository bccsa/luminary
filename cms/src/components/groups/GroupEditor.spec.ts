import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import GroupEditor from "./GroupEditor.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useGroupStore } from "@/stores/group";
import {
    mockGroupPublicContent,
    mockGroupPublicEditors,
    mockGroupPublicUsers,
    mockGroupSuperAdmins,
} from "@/tests/mockData";
import LBadge from "../common/LBadge.vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { useLocalChangeStore } from "@/stores/localChanges";
import { AclPermission, DocType } from "@/types";

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: vi.fn(),
    })),
    onBeforeRouteLeave: vi.fn(),
}));

describe("GroupEditor", () => {
    const saveChangesButton = 'button[data-test="saveChanges"]';
    const discardChangesButton = 'button[data-test="discardChanges"]';

    const createWrapper = async () => {
        const wrapper = mount(GroupEditor, {
            props: {
                group: mockGroupPublicContent,
            },
        });
        // Open up the accordion
        await wrapper.find("button").trigger("click");

        return wrapper;
    };

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        const groupStore = useGroupStore();
        groupStore.groups = [
            mockGroupPublicContent,
            mockGroupPublicUsers,
            mockGroupPublicEditors,
            mockGroupSuperAdmins,
        ];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("displays all ACL groups under the given group", async () => {
        const wrapper = await createWrapper();

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Users");
        expect(wrapper.text()).toContain("Public Editors");
    });

    it("displays buttons when changing a value", async () => {
        const wrapper = await createWrapper();

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).toContain("Discard changes");
        expect(wrapper.text()).toContain("Save changes");
    });

    it("displays a label when there are unsaved changes and the accordion is closed", async () => {
        const wrapper = await createWrapper();

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.findComponent(LBadge).exists()).toBe(false);

        // Close the accordion
        await wrapper.find("button").trigger("click");

        expect(wrapper.findComponent(LBadge).text()).toContain("Unsaved changes");
    });

    it("displays a label when there are offline changes", async () => {
        const socketConnectionStore = useSocketConnectionStore();
        const localChangeStore = useLocalChangeStore();
        socketConnectionStore.isConnected = false;
        // @ts-expect-error - Property is read-only but we are mocking it
        localChangeStore.isLocalChange = () => true;

        const wrapper = await createWrapper();

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(saveChangesButton).trigger("click");

        expect(wrapper.findComponent(LBadge).text()).toContain("Offline changes");
    });

    it("can discard all changes", async () => {
        const wrapper = await createWrapper();

        await wrapper.findAll('[data-test="permissionCell"]')[0].trigger("click");

        await wrapper.find(discardChangesButton).trigger("click");

        expect(wrapper.find(saveChangesButton).exists()).toBe(false);
        expect(wrapper.find(discardChangesButton).exists()).toBe(false);
    });

    it("can add a new group", async () => {
        const wrapper = await createWrapper();

        expect(wrapper.text()).not.toContain("Super Admins");

        await wrapper.find('button[data-test="addGroupButton"]').trigger("click");
        await wrapper.find('button[data-test="selectGroupButton"]').trigger("click");

        expect(wrapper.text()).toContain("Super Admins");
    });

    it("can edit the group name", async () => {
        const groupNameInput = 'input[data-test="groupNameInput"]';
        const groupName = '[data-test="groupName"]';
        const wrapper = await createWrapper();

        await wrapper.find(groupName).trigger("click");

        expect(wrapper.find(groupNameInput).isVisible()).toBe(true);
        expect(wrapper.find(groupName).exists()).toBe(false);

        await wrapper.find(groupNameInput).setValue("New group name");
        await wrapper.find(groupNameInput).trigger("blur");

        expect(wrapper.find(groupNameInput).exists()).toBe(false);
        expect(wrapper.find(groupName).text()).toBe("New group name");
        expect(wrapper.find(saveChangesButton).exists()).toBe(true);

        // Reset back to old value, save changes button should vanish
        await wrapper.find(groupName).trigger("click");
        await wrapper.find(groupNameInput).setValue("Public Content");
        await wrapper.find(groupNameInput).trigger("blur");

        expect(wrapper.find(saveChangesButton).exists()).toBe(false);
    });

    it("duplicate the whole group", async () => {
        const { createGroup } = useGroupStore();
        const wrapper = await createWrapper();

        await wrapper.find("button[data-test='duplicateGroup']").trigger("click");

        // @ts-ignore
        const createGroupCall = createGroup.mock.calls[0][0];
        expect(createGroupCall.acl).toEqual(mockGroupPublicContent.acl);
        expect(createGroupCall.name).toBe("Copy of Public Content");
    });

    it("can copy a group's ID", async () => {
        const wrapper = await createWrapper();
        let clipboardContents = "";
        window.__defineGetter__("navigator", function () {
            return {
                clipboard: {
                    writeText: (text: string) => {
                        clipboardContents = text;
                    },
                },
            };
        });

        await wrapper.find("button[data-test='copyGroupId']").trigger("click");

        expect(clipboardContents).toBe(mockGroupPublicContent._id);
    });

    describe("update ACLs", () => {
        it("correctly adds a new group ACL", async () => {
            const { updateGroup } = useGroupStore();
            const wrapper = await createWrapper();

            // Group=Public Users, DocType=Group, Permission=View
            await wrapper.findAll('[data-test="permissionCell"]')[0].trigger("click");

            await wrapper.find(saveChangesButton).trigger("click");

            // @ts-ignore
            const updateGroupCall = updateGroup.mock.calls[0][0];
            expect(updateGroupCall.acl).toContainEqual({
                type: DocType.Group,
                groupId: "group-public-users",
                permission: [AclPermission.View],
            });
        });

        it("correctly updates an existing group ACL", async () => {
            const { updateGroup } = useGroupStore();
            const wrapper = await createWrapper();

            // Group=Public Users, DocType=Language, Permission=Create
            await wrapper.findAll('[data-test="permissionCell"]')[8].trigger("click");

            await wrapper.find(saveChangesButton).trigger("click");

            // @ts-ignore
            const updateGroupCall = updateGroup.mock.calls[0][0];
            expect(updateGroupCall.acl).toContainEqual({
                type: DocType.Language,
                groupId: "group-public-users",
                permission: [AclPermission.View, AclPermission.Create],
            });
        });

        it("removes an existing group ACL if all permissions are removed", async () => {
            const { updateGroup } = useGroupStore();
            const wrapper = await createWrapper();

            // Group=Public Users, DocType=Language, Permission=View
            await wrapper.findAll('[data-test="permissionCell"]')[7].trigger("click");

            await wrapper.find(saveChangesButton).trigger("click");

            // @ts-ignore
            const updateGroupCall = updateGroup.mock.calls[0][0];
            expect(updateGroupCall.acl).not.toContainEqual({
                type: DocType.Language,
                groupId: "group-public-users",
                permission: [AclPermission.View],
            });
        });

        it("automatically enables View permission if another permission is clicked", async () => {
            const { updateGroup } = useGroupStore();
            const wrapper = await createWrapper();

            // Group=Public Users, DocType=Group, Permission=Create
            await wrapper.findAll('[data-test="permissionCell"]')[1].trigger("click");

            await wrapper.find(saveChangesButton).trigger("click");

            // @ts-ignore
            const updateGroupCall = updateGroup.mock.calls[0][0];
            expect(updateGroupCall.acl).toContainEqual({
                type: DocType.Group,
                groupId: "group-public-users",
                permission: [AclPermission.Create, AclPermission.View],
            });
        });

        it("automatically disables all permissions if View permission is clicked", async () => {
            const { updateGroup } = useGroupStore();
            const wrapper = await createWrapper();

            // Group=Public Editors, DocType=Group, Permission=View
            await wrapper.findAll('[data-test="permissionCell"]')[35].trigger("click");

            await wrapper.find(saveChangesButton).trigger("click");

            // @ts-ignore
            const updateGroupCall = updateGroup.mock.calls[0][0];
            // Just to be sure we check both the old state with permissions View and Assign, and the state with just Assign which is what would happen if the automatic deselect doesn't work
            expect(updateGroupCall.acl).not.toContainEqual({
                type: DocType.Group,
                groupId: "group-public-editors",
                permission: [AclPermission.View, AclPermission.Assign],
            });
            expect(updateGroupCall.acl).not.toContainEqual({
                type: DocType.Group,
                groupId: "group-public-editors",
                permission: [AclPermission.Assign],
            });
        });
    });
});
