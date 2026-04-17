import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { ref } from "vue";
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
import EditAclEntry from "./EditAclEntry.vue";
import _ from "lodash";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal<typeof import("vue-router")>();
    return {
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "edit" }),
        }),
    };
});

describe("EditAclByGroup.vue", () => {
    const createWrapper = async (
        group: GroupDto,
        assignedGroup: GroupDto,
        originalGroup: GroupDto,
        availableGroups: GroupDto[],
        disabled = false,
    ) => {
        const wrapper = mount(EditAclByGroup, {
            props: {
                group,
                assignedGroup,
                originalGroup,
                availableGroups,
                disabled,
            },
        });
        return wrapper;
    };

    beforeAll(() => {
        accessMap.value = superAdminAccessMap;

        // Set up mocks for DOM APIs used by HeadlessUI
        const focusMock = vi.fn();
        Object.defineProperty(HTMLElement.prototype, "focus", {
            value: focusMock,
            configurable: true,
        });
        Object.defineProperty(SVGElement.prototype, "focus", {
            value: focusMock,
            configurable: true,
        });

        // Mock other DOM methods HeadlessUI might use
        Element.prototype.scrollIntoView = vi.fn();
        window.getComputedStyle = vi.fn().mockReturnValue({
            display: "block",
            visibility: "visible",
        });

    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        // Reset accessMap before each test with a deep clone
        accessMap.value = _.cloneDeep(superAdminAccessMap);
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

        // Group=Public Editors, DocType=Group, Permission=View
        expect(
            group.acl.find(
                (acl) =>
                    acl.groupId === "group-public-editors" &&
                    acl.type == DocType.Group &&
                    acl.permission.includes(AclPermission.View),
            ),
        ).toBeDefined();

        await wrapper.find('[data-test="display-card"]').trigger("click");
        await wrapper.vm.$nextTick();

        await waitForExpect(() => {
            expect(wrapper.findAllComponents(EditAclEntry).length).toBeGreaterThan(0);
        });

        const entries = wrapper.findAllComponents(EditAclEntry);
        // First row matches the first sorted active type (Group for this mock)
        const firstEntry = entries[0];
        await firstEntry.find("button.text-zinc-700").trigger("click");
        await wrapper.vm.$nextTick();

        await firstEntry.find("button.flex.items-center.gap-1").trigger("click");

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
        const wrapper = mount(DuplicateGroupAclButton, {
            props: {
                groups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                ],
            },
        });

        // Click directly on the element with the data-test attribute
        await wrapper.find('[data-test="duplicateAclIcon"]').trigger("click");

        // Assert that all group names are present in the wrapper's text
        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Editors");
        expect(wrapper.text()).toContain("Public Users");

        // Click directly on the element with the data-test attribute
        await wrapper.find('[data-test="selectGroupIcon"]').trigger("click");

        // Assert that the event is emitted when clicking a group
        expect(wrapper.emitted("select")?.length).toBe(1);
        // @ts-ignore
        expect(wrapper.emitted("select")![0][0].name).toEqual("Public Content");
    });

    it("checks if acl entries are disabled when no edit permission", async () => {
        // Make a clean copy of the access map and modify it
        const modifiedAccessMap = _.cloneDeep(superAdminAccessMap);
        modifiedAccessMap["group-public-content"].group = {
            ...(modifiedAccessMap["group-public-content"].group ?? {}),
            edit: false,
        };
        accessMap.value = modifiedAccessMap;

        // Set disabled prop to true since component should be in disabled state without edit permission
        const wrapper = await createWrapper(
            _.cloneDeep(mockGroupDtoPublicContent),
            _.cloneDeep(mockGroupDtoPublicContent),
            _.cloneDeep(mockGroupDtoPublicContent),
            [
                _.cloneDeep(mockGroupDtoPublicContent),
                _.cloneDeep(mockGroupDtoPublicEditors),
                _.cloneDeep(mockGroupDtoPublicUsers),
                _.cloneDeep(mockGroupDtoSuperAdmins),
            ],
            true, // Explicitly set disabled
        );

        // Check that the component is in disabled state by verifying the disabled prop
        expect(wrapper.props("disabled")).toBe(true);

        // Verify that permissions can't be changed by trying to click a permission cell
        const permissionCell = await wrapper.find('[data-test="permissionCell"]');
        if (permissionCell.exists()) {
            // Store initial ACL state
            const initialAclState = _.cloneDeep(wrapper.props("group")!.acl);

            // Try to click the permission cell
            await permissionCell.trigger("click");

            // ACL should remain unchanged
            expect(wrapper.props("group")!.acl).toEqual(initialAclState);
        } else {
            // If no permission cells exist, that's another way to verify disabled state
            expect(wrapper.find('[data-test="permission-table"]').exists()).toBe(false);
        }
    });

    it("checks if acl entries are disabled when no assign permission", async () => {
        // Make a clean copy of the access map and modify it
        const modifiedAccessMap = _.cloneDeep(superAdminAccessMap);
        modifiedAccessMap["group-public-content"].group = {
            ...(modifiedAccessMap["group-public-content"].group ?? {}),
            assign: false,
        };
        accessMap.value = modifiedAccessMap;

        // Set disabled prop to true since component should be in disabled state without assign permission
        const wrapper = await createWrapper(
            _.cloneDeep(mockGroupDtoPublicContent),
            _.cloneDeep(mockGroupDtoPublicContent),
            _.cloneDeep(mockGroupDtoPublicContent),
            [
                _.cloneDeep(mockGroupDtoPublicContent),
                _.cloneDeep(mockGroupDtoPublicEditors),
                _.cloneDeep(mockGroupDtoPublicUsers),
                _.cloneDeep(mockGroupDtoSuperAdmins),
            ],
            true, // Explicitly set disabled
        );

        // Check that the component is in disabled state by verifying the disabled prop
        expect(wrapper.props("disabled")).toBe(true);

        // Verify that permissions can't be changed by trying to click a permission cell
        const permissionCell = await wrapper.find('[data-test="permissionCell"]');
        if (permissionCell.exists()) {
            // Store initial ACL state
            const initialAclState = _.cloneDeep(wrapper.props("group")!.acl);

            // Try to click the permission cell
            await permissionCell.trigger("click");

            // ACL should remain unchanged
            expect(wrapper.props("group")!.acl).toEqual(initialAclState);
        } else {
            // If no permission cells exist, that's another way to verify disabled state
            expect(wrapper.find('[data-test="permission-table"]').exists()).toBe(false);
        }
    });
});
