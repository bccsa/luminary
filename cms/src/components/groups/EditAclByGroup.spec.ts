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
import { accessMap, AclPermission, db, DocType, type GroupDto } from "luminary-shared";
import DuplicateGroupAclButton from "./DuplicateGroupAclButton.vue";
import waitForExpect from "wait-for-expect";
import EditAclByGroup from "./EditAclByGroup.vue";
import _ from "lodash";

describe.skip("EditAclByGroup.vue", () => {
    const createWrapper = async (
        group: GroupDto,
        assignedGroup: GroupDto,
        originalGroup: GroupDto,
        availableGroups: GroupDto[],
    ) => {
        const wrapper = mount(EditAclByGroup, {
            props: {
                group,
                assignedGroup,
                originalGroup,
                availableGroups,
                disabled: false,
            },
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

    it("correctly adds a new ACL entry", async () => {
        const group = mockGroupDtoPublicContent;
        const originalGroup = _.cloneDeep(group);
        const assignedGroup = mockGroupDtoPublicEditors;
        const availableGroups = [
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ];
        await db.docs.bulkPut(availableGroups);

        const wrapper = await createWrapper(group, assignedGroup, originalGroup, availableGroups);

        // Wait for content to load
        let permissionCell;
        await waitForExpect(async () => {
            permissionCell = wrapper.find('[data-test="permissionCell"]');
            expect(permissionCell.exists()).toBe(true);
        });

        // Group=Public Editors, DocType=Group, Permission=View
        // Check if the view permission is set
        expect(
            group.acl.find(
                (acl) =>
                    acl.groupId === "group-public-editors" &&
                    acl.type == DocType.Group &&
                    acl.permission.includes(AclPermission.View),
            ),
        ).toBeDefined();

        await wrapper.findAll('[data-test="permissionCell"]')[0].trigger("click");

        // Check if the view permission is removed
        expect(
            group.acl.find(
                (acl) =>
                    acl.groupId === "group-public-editors" &&
                    acl.type == DocType.Group &&
                    acl.permission.includes(AclPermission.View),
            ),
        ).toBeUndefined();
    });

    it("correctly duplicates an ACL group", async () => {
        const duplicateAclIcon = 'button[data-test="duplicateAclIcon"]';
        const selectGroupIcon = 'button[data-test="selectGroupIcon"]';

        const wrapper = mount(DuplicateGroupAclButton, {
            props: {
                groups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                ],
            },
        });

        // Simulate clicking on the duplicate ACL icon
        await wrapper.find(duplicateAclIcon).trigger("click");

        // Assert that all group names are present in the wrapper's text
        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Editors");
        expect(wrapper.text()).toContain("Public Users");

        // Simulate clicking on the select group icon
        await wrapper.find(selectGroupIcon).trigger("click");

        // Assert that the event is emitted when clicking a group
        expect(wrapper.emitted("select")?.length).toBe(1);
        // @ts-ignore
        expect(wrapper.emitted("select")![0][0].name).toEqual("Public Content");
    });

    it("checks if acl entries are disabled when no edit permission", async () => {
        delete accessMap.value["group-public-content"].group?.edit;

        const wrapper = mount(EditAclByGroup, {
            props: {
                group: mockGroupDtoPublicContent,
                assignedGroup: mockGroupDtoPublicContent,
                originalGroup: mockGroupDtoPublicContent,
                availableGroups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                    mockGroupDtoSuperAdmins,
                ],
                disabled: false,
            },
        });

        // Check that he duplicate ACL button is not present indicating that editing is disabled
        expect(wrapper.html()).not.toContain('div[data-test="duplicateAcl"]');
    });

    it("checks if acl entries are disabled when no assign permission", async () => {
        delete accessMap.value["group-public-content"].group?.assign;

        const wrapper = mount(EditAclByGroup, {
            props: {
                group: mockGroupDtoPublicContent,
                assignedGroup: mockGroupDtoPublicContent,
                originalGroup: mockGroupDtoPublicContent,
                availableGroups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                    mockGroupDtoSuperAdmins,
                ],
                disabled: false,
            },
        });

        // Check that he duplicate ACL button is not present indicating that editing is disabled
        expect(wrapper.html()).not.toContain('div[data-test="duplicateAcl"]');
    });
});
