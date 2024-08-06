import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    mockGroupDtoSuperAdmins,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { accessMap, db, DocType, isConnected, type GroupDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import EditGroup from "./EditGroup.vue";

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: vi.fn(),
    })),
    onBeforeRouteLeave: vi.fn(),
}));

describe("EditGroup.vue", () => {
    const saveChangesButton = 'button[data-test="saveChanges"]';
    const discardChangesButton = 'button[data-test="discardChanges"]';

    const createWrapper = async (group: GroupDto) => {
        const wrapper = mount(EditGroup, {
            props: {
                group,
            },
        });
        // Open up the accordion
        await wrapper.find("button").trigger("click");

        let permissionCell;
        await waitForExpect(async () => {
            permissionCell = wrapper.find('[data-test="permissionCell"]');
            expect(permissionCell.exists()).toBe(true);
        });

        return wrapper;
    };

    beforeAll(() => {
        accessMap.value = superAdminAccessMap;
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        db.docs.clear();
        db.localChanges.clear();
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("displays all ACL groups under the given group", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Users");
            expect(wrapper.text()).toContain("Public Editors");
        });
    });

    it("displays buttons when changing a value", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).toContain("Discard changes");
        expect(wrapper.text()).toContain("Save changes");
    });

    it("displays a label when there are unsaved changes and the accordion is closed", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).not.toContain("Unsaved changes");

        // Close the accordion
        await wrapper.find("button").trigger("click");

        expect(wrapper.text()).toContain("Unsaved changes");
    });

    it("displays a label when there are offline changes", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        isConnected.value = false;

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        expect(wrapper.text()).not.toContain("Offline changes");

        // Upsert a local change
        await db.upsert({ ...mockGroupDtoPublicContent, updatedTimeUtc: 1234 });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Offline changes");
        });
    });

    it("can save changes", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(saveChangesButton).trigger("click");

        await waitForExpect(async () => {
            const group = await db.docs.get(mockGroupDtoPublicContent._id);
            expect(group!.acl).not.toEqual(mockGroupDtoPublicContent.acl);
        });
    });

    it("can discard all changes", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(discardChangesButton).trigger("click");

        expect(wrapper.find(saveChangesButton).exists()).toBe(false);
        expect(wrapper.find(discardChangesButton).exists()).toBe(false);
    });

    it("can add a new group", async () => {
        await db.docs.bulkPut([mockGroupDtoPublicEditors, mockGroupDtoPublicContent]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);
        expect(wrapper.text()).not.toContain("Super Admins");

        await wrapper.find('button[data-test="addGroupButton"]').trigger("click");
        await wrapper.find('button[data-test="selectGroupButton"]').trigger("click");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
        });
    });

    it("can edit the group name", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const groupNameInput = 'input[data-test="groupNameInput"]';
        const groupName = '[data-test="groupName"]';
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

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
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find("button[data-test='duplicateGroup']").trigger("click");

        await waitForExpect(async () => {
            const groups = await (db.docs
                .where({ type: DocType.Group })
                .toArray() as unknown as Promise<GroupDto[]>);

            expect(groups.some((g) => g.name == "Public Content - copy")).toBe(true);
        });
    });

    it("can copy a group's ID", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);
        let clipboardContents = "";
        // @ts-ignore
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

        expect(clipboardContents).toBe(mockGroupDtoPublicContent._id);
    });

    it("removes an existing group ACL if all permissions are removed", async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        // Group=Public Editors, DocType=Post, Permission=View  -  Clearing this should clear all the permissions, and cause the ACL entry to be deleted
        await wrapper.findAll('[data-test="permissionCell"]')[14].trigger("click");
        await wrapper.find(saveChangesButton).trigger("click");

        await waitForExpect(async () => {
            const group = await db.docs.get(mockGroupDtoPublicContent._id);
            expect(
                group!.acl?.some(
                    (g) => g.groupId == "group-public-editors" && g.type == DocType.Post,
                ),
            ).toBeFalsy();
        });
    });

    it("checks if groups are disabled when no edit permissions", async () => {
        delete accessMap.value["group-public-content"].group?.edit;

        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        expect(wrapper.text()).toContain("No edit access.");
        expect(wrapper.find("button[title='Duplicate']").exists()).toBe(false);
        expect(wrapper.find("button[data-test='addGroupButton']").exists()).toBe(false);
    });
});
