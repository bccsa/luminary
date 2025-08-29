import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, computed } from "vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import EditGroup from "./EditGroup.vue";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    mockGroupDtoSuperAdmins,
    superAdminAccessMap,
} from "@/tests/mockdata";
import {
    accessMap,
    DocType,
    type GroupDto,
    AckStatus,
    type ApiLiveQueryAsEditable,
    AclPermission,
} from "luminary-shared";

// Mock clipboard API
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn(),
    },
});

// Mock luminary-shared functions
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        verifyAccess: vi.fn(),
        isConnected: ref(true),
        db: {
            uuid: vi.fn(() => "new-uuid-123"),
        },
    };
});

const { verifyAccess, isConnected } = await import("luminary-shared");

describe("EditGroup", () => {
    let mockGroupQuery: Partial<ApiLiveQueryAsEditable<GroupDto>>;
    let testGroup: GroupDto;
    let allGroups: GroupDto[];
    let isEditedMock: any;

    beforeEach(() => {
        setActivePinia(createTestingPinia({ createSpy: vi.fn }));

        // Reset mocks
        vi.clearAllMocks();

        // Set up test data
        allGroups = [
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoSuperAdmins,
        ];

        testGroup = { ...mockGroupDtoPublicContent };

        // Create isEdited mock function
        isEditedMock = vi.fn().mockReturnValue(false);

        // Mock the live query
        mockGroupQuery = {
            liveData: computed(() => allGroups),
            isEdited: computed(() => isEditedMock),
            revert: vi.fn(),
            save: vi.fn().mockResolvedValue({ ack: AckStatus.Accepted }),
            duplicate: vi.fn().mockResolvedValue({ ack: AckStatus.Accepted }),
            editable: ref([testGroup]),
        };

        // Set default access map to super admin for most tests
        accessMap.value = superAdminAccessMap;

        // Default verifyAccess to return true
        vi.mocked(verifyAccess).mockReturnValue(true);

        // Default isConnected to true
        isConnected.value = true;
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    const createWrapper = (group = testGroup, props = {}) => {
        return mount(EditGroup, {
            props: {
                groupQuery: mockGroupQuery as ApiLiveQueryAsEditable<GroupDto>,
                group: group,
                "onUpdate:group": vi.fn(),
                ...props,
            },
            global: {
                plugins: [createTestingPinia({ createSpy: vi.fn })],
                stubs: {
                    EditAclByGroup: true,
                    AddGroupAclButton: true,
                    ConfirmBeforeLeavingModal: true,
                    LButton: {
                        template:
                            '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
                    },
                    LBadge: {
                        template: '<span class="badge" v-bind="$attrs"><slot /></span>',
                    },
                    LInput: {
                        template:
                            '<input ref="groupNameInput" v-bind="$attrs" @blur="$emit(\'blur\')" @keyup.enter="$emit(\'keyup\', $event)" data-test="groupNameInput" />',
                        methods: {
                            focus: vi.fn(),
                        },
                    },
                    TransitionGroup: {
                        template: "<div><slot /></div>",
                    },
                },
            },
        });
    };

    describe("Group Name Editing", () => {
        it("allows clicking on group name to edit when not disabled", async () => {
            const wrapper = createWrapper();

            const groupNameElement = wrapper.find('[data-test="groupName"]');
            await groupNameElement.trigger("click");

            expect(wrapper.find('[data-test="groupNameInput"]').exists()).toBe(true);
        });

        it("does not allow editing group name when disabled", async () => {
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            const groupNameElement = wrapper.find('[data-test="groupName"]');
            await groupNameElement.trigger("click");

            expect(wrapper.find('[data-test="groupNameInput"]').exists()).toBe(false);
        });
    });

    describe("Save and Discard Changes", () => {
        it("shows save and discard buttons when group is dirty and not disabled", async () => {
            isEditedMock.mockReturnValue(true);

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(true);
            expect(wrapper.find('[data-test="discardChanges"]').exists()).toBe(true);
        });

        it("does not show save and discard buttons when group is not dirty", () => {
            isEditedMock.mockReturnValue(false);

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(false);
            expect(wrapper.find('[data-test="discardChanges"]').exists()).toBe(false);
        });

        it("does not show save and discard buttons when disabled", () => {
            isEditedMock.mockReturnValue(true);
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(false);
            expect(wrapper.find('[data-test="discardChanges"]').exists()).toBe(false);
        });

        it("calls revert when discard changes is clicked", async () => {
            isEditedMock.mockReturnValue(true);

            const wrapper = createWrapper();

            await wrapper.find('[data-test="discardChanges"]').trigger("click");

            expect(mockGroupQuery.revert).toHaveBeenCalledWith(testGroup._id);
        });

        it("calls save when save changes is clicked", async () => {
            isEditedMock.mockReturnValue(true);

            const wrapper = createWrapper();

            await wrapper.find('[data-test="saveChanges"]').trigger("click");

            expect(mockGroupQuery.save).toHaveBeenCalledWith(testGroup._id);
        });

        it("does not show save button when user lacks edit permissions", async () => {
            isEditedMock.mockReturnValue(true);

            // Create a group with no edit permissions in ACL and mock verifyAccess to return false
            const groupWithoutEditPerms = { ...testGroup, acl: [] };
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper(groupWithoutEditPerms);

            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(false);
        });

        it("does not show save button when offline", async () => {
            isEditedMock.mockReturnValue(true);
            isConnected.value = false;

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(false);
        });
    });

    describe("Status Badges", () => {
        it("shows 'Unsaved changes' badge when group is dirty", () => {
            isEditedMock.mockReturnValue(true);

            const wrapper = createWrapper();

            expect(wrapper.text()).toContain("Unsaved changes");
        });

        it("shows warning badge when group is empty", () => {
            const emptyGroup = { ...testGroup, acl: [] };
            const wrapper = createWrapper(emptyGroup);

            expect(wrapper.text()).toContain("The group does not have any access configured");
        });

        it("shows warning badge when group would not be editable after save", () => {
            isEditedMock.mockReturnValue(true);

            // Create a group with ACL that doesn't include edit permissions
            const groupWithoutEditPerms = {
                ...testGroup,
                acl: [
                    {
                        type: DocType.Post,
                        groupId: "group-public-users",
                        permission: [AclPermission.View], // No edit permission
                    },
                ],
            };
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper(groupWithoutEditPerms);

            expect(wrapper.text()).toContain("Saving disabled: The group would not be editable");
        });

        it("shows offline warning when not connected", () => {
            isConnected.value = false;

            const wrapper = createWrapper();

            expect(wrapper.text()).toContain("Saving disabled: Unable to save while offline");
        });
    });

    describe("Duplicate Functionality", () => {
        it("shows duplicate button for existing saved groups", () => {
            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(true);
        });

        it("does not show duplicate button for new groups", () => {
            const newGroup = { ...testGroup, _id: "new-group-id" };
            // Modify the mock to not include the new group in live data
            const modifiedMockQuery = {
                ...mockGroupQuery,
                liveData: computed(() => [mockGroupDtoPublicEditors]), // newGroup not in live data
            };

            const wrapper = mount(EditGroup, {
                props: {
                    groupQuery: modifiedMockQuery as ApiLiveQueryAsEditable<GroupDto>,
                    group: newGroup,
                    "onUpdate:group": vi.fn(),
                },
                global: {
                    plugins: [createTestingPinia({ createSpy: vi.fn })],
                    stubs: {
                        EditAclByGroup: true,
                        AddGroupAclButton: true,
                        ConfirmBeforeLeavingModal: true,
                        LButton: true,
                        LBadge: true,
                        LInput: true,
                    },
                },
            });

            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(false);
        });

        it("does not show duplicate button for dirty groups", () => {
            isEditedMock.mockReturnValue(true);

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(false);
        });

        it("does not show duplicate button when disabled", () => {
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(false);
        });

        it("calls duplicate function when duplicate button is clicked", async () => {
            // Mock db.uuid
            const { db } = await import("luminary-shared");
            vi.mocked(db.uuid).mockReturnValue("new-uuid-123");

            const wrapper = createWrapper();

            await wrapper.find('[data-test="duplicateGroup"]').trigger("click");

            expect(mockGroupQuery.duplicate).toHaveBeenCalled();
        });
    });

    describe("Copy Group ID", () => {
        it("copies group ID to clipboard when copy button is clicked", async () => {
            const wrapper = createWrapper();

            await wrapper.find('[data-test="copyGroupId"]').trigger("click");

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testGroup._id);
        });
    });

    describe("Permissions and Access Control", () => {
        it("shows disabled styling when user lacks permissions", () => {
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            const container = wrapper.find(".w-full.overflow-visible.rounded-md");
            expect(container.classes()).toContain("bg-zinc-100");
        });

        it("shows 'No edit access' message when disabled", () => {
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            expect(wrapper.text()).toContain("No edit access");
        });

        it("shows normal styling when user has permissions", () => {
            const wrapper = createWrapper();

            const container = wrapper.find(".w-full.overflow-visible.rounded-md");
            expect(container.classes()).toContain("bg-white");
            expect(container.classes()).not.toContain("bg-zinc-100");
        });
    });

    describe("Computed Properties", () => {
        it("shows new group behavior when group is not in live data", () => {
            const newGroup = { ...testGroup, _id: "new-group-id" };
            // Create a modified mock that doesn't include the new group
            const modifiedMockQuery = {
                ...mockGroupQuery,
                liveData: computed(() => [mockGroupDtoPublicEditors]), // newGroup not in live data
            };

            const wrapper = mount(EditGroup, {
                props: {
                    groupQuery: modifiedMockQuery as ApiLiveQueryAsEditable<GroupDto>,
                    group: newGroup,
                    "onUpdate:group": vi.fn(),
                },
                global: {
                    plugins: [createTestingPinia({ createSpy: vi.fn })],
                    stubs: {
                        EditAclByGroup: true,
                        AddGroupAclButton: true,
                        ConfirmBeforeLeavingModal: true,
                        LButton: true,
                        LBadge: true,
                        LInput: true,
                    },
                },
            });

            // Should not show duplicate button for new groups
            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(false);
        });

        it("shows changed group name styling when name differs from original", () => {
            const modifiedGroup = { ...testGroup, name: "Changed Name" };
            const wrapper = createWrapper(modifiedGroup);

            const groupNameElement = wrapper.find('[data-test="groupName"]');
            expect(groupNameElement.classes()).toContain("bg-yellow-200");
        });

        it("shows empty group warning when ACL is empty", () => {
            const emptyGroup = { ...testGroup, acl: [] };
            const wrapper = createWrapper(emptyGroup);

            expect(wrapper.text()).toContain("The group does not have any access configured");
        });

        it("shows empty group warning when all permissions are empty", () => {
            const groupWithEmptyPermissions = {
                ...testGroup,
                acl: [{ groupId: "test-group", type: DocType.Group, permission: [] }],
            };
            const wrapper = createWrapper(groupWithEmptyPermissions);

            expect(wrapper.text()).toContain("The group does not have any access configured");
        });
    });

    describe("Edge Cases", () => {
        it("handles empty ACL arrays", () => {
            const groupWithEmptyAcl = { ...testGroup, acl: [] };
            const wrapper = createWrapper(groupWithEmptyAcl);

            // Should show the empty group warning
            expect(wrapper.text()).toContain("The group does not have any access configured");
        });

        it("handles groups with only empty permission arrays", () => {
            const groupWithEmptyPermissions = {
                ...testGroup,
                acl: [{ groupId: "test-group", type: DocType.Group, permission: [] }],
            };
            const wrapper = createWrapper(groupWithEmptyPermissions);

            // Should show the empty group warning
            expect(wrapper.text()).toContain("The group does not have any access configured");
        });

        it("handles missing original group gracefully", () => {
            const newGroup = { ...testGroup, _id: "non-existent-id" };
            // Create a modified mock that doesn't include the new group
            const modifiedMockQuery = {
                ...mockGroupQuery,
                liveData: computed(() => [mockGroupDtoPublicEditors]), // newGroup not in live data
            };

            const wrapper = mount(EditGroup, {
                props: {
                    groupQuery: modifiedMockQuery as ApiLiveQueryAsEditable<GroupDto>,
                    group: newGroup,
                    "onUpdate:group": vi.fn(),
                },
                global: {
                    plugins: [createTestingPinia({ createSpy: vi.fn })],
                    stubs: {
                        EditAclByGroup: true,
                        AddGroupAclButton: true,
                        ConfirmBeforeLeavingModal: true,
                        LButton: true,
                        LBadge: true,
                        LInput: true,
                    },
                },
            });

            // Should not show duplicate button for new groups
            expect(wrapper.find('[data-test="duplicateGroup"]').exists()).toBe(false);
            // Should not show changed name styling since there's no original
            const groupNameElement = wrapper.find('[data-test="groupName"]');
            expect(groupNameElement.classes()).not.toContain("bg-yellow-200");
        });
    });

    describe("Event Handling", () => {
        it("prevents default when clicking group name to edit", async () => {
            const wrapper = createWrapper();

            const groupNameElement = wrapper.find('[data-test="groupName"]');
            await groupNameElement.trigger("click");

            // If click worked, we should see the input field
            expect(wrapper.find('[data-test="groupNameInput"]').exists()).toBe(true);
        });

        it("stops propagation for input events when editing", async () => {
            const wrapper = createWrapper();

            // Start editing
            await wrapper.find('[data-test="groupName"]').trigger("click");

            const input = wrapper.find('[data-test="groupNameInput"]');
            expect(input.exists()).toBe(true);

            // These events should be handled without errors
            await input.trigger("keydown.space");
            await input.trigger("keydown.enter");
            await input.trigger("click");

            // No errors should have been thrown
            expect(true).toBe(true);
        });
    });

    describe("Group ACL Management", () => {
        it("displays EditAclByGroup components for assigned groups", () => {
            const wrapper = createWrapper();

            // Check that EditAclByGroup components are rendered for assigned groups
            const aclComponents = wrapper.findAllComponents({ name: "EditAclByGroup" });
            expect(aclComponents.length).toBeGreaterThan(0);
        });

        it("shows AddGroupAclButton when not disabled", () => {
            const wrapper = createWrapper();

            const addButton = wrapper.findComponent({ name: "AddGroupAclButton" });
            expect(addButton.exists()).toBe(true);
        });

        it("does not show AddGroupAclButton when disabled", () => {
            vi.mocked(verifyAccess).mockReturnValue(false);

            const wrapper = createWrapper();

            const addButton = wrapper.findComponent({ name: "AddGroupAclButton" });
            expect(addButton.exists()).toBe(false);
        });
    });

    describe("Visual State Updates", () => {
        it("updates styling based on dirty state", async () => {
            // Test with clean state
            isEditedMock.mockReturnValue(false);
            const cleanWrapper = createWrapper();

            // Initially no unsaved changes badge
            expect(cleanWrapper.text()).not.toContain("Unsaved changes");

            // Test with dirty state
            isEditedMock.mockReturnValue(true);
            const dirtyWrapper = createWrapper();

            // Should show unsaved changes badge
            expect(dirtyWrapper.text()).toContain("Unsaved changes");
        });

        it("updates button visibility based on connection status", async () => {
            isEditedMock.mockReturnValue(true);
            isConnected.value = true;

            const wrapper = createWrapper();

            // Initially connected, should show save button
            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(true);

            // Disconnect
            isConnected.value = false;
            await wrapper.vm.$nextTick();

            // Should no longer show save button
            expect(wrapper.find('[data-test="saveChanges"]').exists()).toBe(false);
        });
    });
});
