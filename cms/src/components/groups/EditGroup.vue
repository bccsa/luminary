<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import {
    AclPermission,
    db,
    DocType,
    isConnected,
    verifyAccess,
    type GroupDto,
} from "luminary-shared";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { DocumentDuplicateIcon, ChevronUpIcon, RectangleStackIcon } from "@heroicons/vue/20/solid";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import EditAclByGroup from "./EditAclByGroup.vue";
import { useNotificationStore } from "@/stores/notification";
import LBadge from "@/components/common/LBadge.vue";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import LInput from "../forms/LInput.vue";
import _ from "lodash";
import { compactAclEntries, validDocTypes } from "./permissions";
import { ExclamationCircleIcon } from "@heroicons/vue/16/solid";

const { addNotification } = useNotificationStore();

type Props = {
    group: GroupDto;
};
const props = defineProps<Props>();

const groups = db.whereTypeAsRef<GroupDto[]>(DocType.Group, []);
const editable = ref<GroupDto>(_.cloneDeep(toRaw(props.group)));
const editableGroupWithoutEmpty = ref<GroupDto>(editable.value);
const originalGroupWithoutEmpty = ref<GroupDto>(props.group);

// Clear ACL's with no permissions from "editable" and save to "editableGroupWithoutEmpty"
watch(
    editable,
    (current) => {
        editableGroupWithoutEmpty.value = {
            ...current,
            acl: compactAclEntries(current.acl),
        };
    },
    { deep: true, immediate: true },
);

// Clear ACL's with no permissions from the passed group and save to "originalGroupWithoutEmpty"
watch(
    () => props.group,
    (current) => {
        originalGroupWithoutEmpty.value = {
            ...current,
            acl: compactAclEntries(current.acl),
        };
    },
    { deep: true, immediate: true },
);

// Keep editable up to date with upstream changes to the passed group
watch(
    () => props.group,
    (current, previous) => {
        if (previous.name == editable.value.name) {
            editable.value.name = current.name;
        }

        // Update / add permissions to editable
        current.acl.forEach((currentAcl) => {
            let editableAcl = editable.value.acl.find(
                (a) => a.groupId == currentAcl.groupId && a.type == currentAcl.type,
            );
            const previousAcl = previous.acl.find(
                (a) => a.groupId == currentAcl.groupId && a.type == currentAcl.type,
            );

            Object.values(AclPermission).forEach((permission) => {
                const editableHasPermission = editableAcl?.permission.includes(permission) || false;
                const currentHasPermission = currentAcl.permission.includes(permission) || false;
                const previousHasPermission = previousAcl?.permission.includes(permission) || false;

                // Do not update permissions that were added by the user
                if (editableHasPermission != previousHasPermission) {
                    return;
                }

                // The editable already has the same permission as the current
                if (currentHasPermission == editableHasPermission) {
                    return;
                }

                // Create a new ACL entry if it does not exist in the editable group
                if (!editableAcl) {
                    editableAcl = {
                        groupId: currentAcl.groupId,
                        type: currentAcl.type,
                        permission: [],
                    };
                    editable.value.acl.push(editableAcl);
                }

                // Update the permission
                if (currentHasPermission) {
                    editableAcl.permission.push(permission);
                } else {
                    editableAcl.permission = editableAcl?.permission.filter((p) => p != permission);
                }
            });
        });

        // Clear permissions from ACL entries that are no longer present in the current group
        editable.value.acl
            .filter((a) => !current.acl.some((c) => c.groupId == a.groupId && c.type == a.type))
            .forEach((aclEntry) => {
                aclEntry.permission = [];
            });
    },
    { deep: true },
);

const isEditingGroupName = ref(false);
const isLocalChange = db.isLocalChangeAsRef(props.group._id);
const groupNameInput = ref<HTMLInputElement>();

const assignedGroups = computed(() => {
    return groups.value
        .filter((g) => editable.value.acl.some((acl) => acl.groupId == g._id))
        .sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
});

// Add empty aclEntries to "editable" per assigned group for a complete visual overview
watch(assignedGroups, (newAssignedGroups, oldAssignedGroups) => {
    // Get unique IDs of assigned groups not available to the user (the user does not have view access to these group documents, so they are not in the groups list)
    const unavailableGroupsIds = [
        ...new Set(
            props.group.acl
                .map((a) => a.groupId)
                .filter((g) => !groups.value.some((gr) => gr._id == g)),
        ),
    ];

    // Create placeholder GroupDto's for the unavailable groups
    const unavailableGroups: GroupDto[] = unavailableGroupsIds.map((g) => ({
        _id: g,
        type: DocType.Group,
        updatedTimeUtc: 0,
        name: g,
        acl: [],
    }));

    // get newly assigned groups
    let newGroups = newAssignedGroups;

    // Add unavailable assigned groups to the list of assigned groups
    newGroups.push(...unavailableGroups);

    if (oldAssignedGroups) {
        newGroups = newAssignedGroups.filter((g) => !oldAssignedGroups.some((o) => o._id == g._id));
    }

    // Add missing ACL entries
    newGroups.forEach((assignedGroup) => {
        validDocTypes.forEach((docType) => {
            const aclEntry = editable.value.acl.find(
                (acl) => acl.groupId == assignedGroup._id && acl.type == docType,
            );
            if (!aclEntry) {
                editable.value.acl.push({
                    groupId: assignedGroup._id,
                    type: docType,
                    permission: [],
                });
            }
        });
    });
});

const availableGroups = computed(() => {
    return groups.value.filter((g) => {
        if (editable.value.acl.some((acl) => acl.groupId == g._id)) return false;

        return verifyAccess([g._id], DocType.Group, AclPermission.Assign);
    });
});

const isDirty = computed(() => {
    return !_.isEqual(
        { ...toRaw(originalGroupWithoutEmpty.value), updatedTimeUtc: 0, _rev: "" },
        { ...toRaw(editableGroupWithoutEmpty.value), updatedTimeUtc: 0, _rev: "" },
    );
});

const hasChangedGroupName = computed(() => editable.value.name != props.group.name);
const isNewGroup = computed(() => !groups.value.some((g) => g._id == props.group._id));
const isEmpty = computed(() => editableGroupWithoutEmpty.value.acl.length == 0);

const disabled = computed(() => {
    // Enable editing for new / unsaved groups
    if (isNewGroup.value || isLocalChange.value) {
        return false;
    }

    return !verifyAccess([props.group._id], DocType.Group, AclPermission.Edit);
});

/**
 * Check if the user will have permission to edit the group
 */
const hasEditPermission = computed(() => {
    // Bypass this check if the group is not in edit mode
    if (!isDirty.value) return true;

    // Check if the user will have inherited permissions to edit the group (exclude self-assigned permissions)
    const hasInheritedPermissions = verifyAccess(
        [
            ...new Set(
                editableGroupWithoutEmpty.value.acl
                    .map((a) => a.groupId)
                    .filter((g) => g != props.group._id),
            ),
        ],
        DocType.Group,
        AclPermission.Edit,
    );

    // Check if the ACL includes group edit permissions.
    // We here rely on the available groups already being filtered with groups to which the user has assign permissions
    const editableAcl = editable.value.acl.some(
        (a) => a.type == DocType.Group && a.permission.includes(AclPermission.Edit),
    );

    return hasInheritedPermissions || editableAcl;
});

const startEditingGroupName = (e: Event, open: boolean) => {
    if (!open) return;
    if (disabled.value) return;

    e.preventDefault();

    isEditingGroupName.value = true;
    nextTick(() => {
        groupNameInput.value?.focus();
    });
};

const finishEditingGroupName = () => {
    isEditingGroupName.value = false;
};

const discardChanges = () => {
    editable.value.name = props.group.name;
    editable.value.acl.forEach((acl) => {
        acl.permission = _.cloneDeep(
            props.group.acl.find((a) => a.groupId == acl.groupId && a.type == acl.type)
                ?.permission || [],
        );
    });
};

const addAssignedGroup = (selectedGroup: GroupDto) => {
    editable.value.acl.push(
        ...validDocTypes.map((docType) => ({
            groupId: selectedGroup._id,
            type: docType,
            permission: [],
        })),
    );
};

const duplicateGroup = async () => {
    const duplicatedGroup = { ...toRaw(props.group), _id: db.uuid() };
    duplicatedGroup.name = `${duplicatedGroup.name} - copy`;
    await db.upsert<GroupDto>(duplicatedGroup);
};

const copyGroupId = (group: GroupDto) => {
    const groupId = group._id;
    navigator.clipboard.writeText(groupId);

    addNotification({
        title: `Group ID Copied`,
        description: "The ID of the group has been copied to the clipboard",
        state: "success",
    });
};

const saveChanges = async () => {
    db.upsert<GroupDto>(toRaw(editableGroupWithoutEmpty.value));

    addNotification({
        title: `${editableGroupWithoutEmpty.value.name} changes saved`,
        description: `All changes are saved ${
            isConnected.value
                ? "online"
                : "offline, and will be sent to the server when you go online"
        }.`,
        state: "success",
    });
};
</script>

<template>
    <div
        :class="[
            'w-full overflow-visible rounded-md shadow',
            { 'bg-zinc-100': disabled },
            { 'bg-white': !disabled },
        ]"
    >
        <Disclosure v-slot="{ open }">
            <DisclosureButton
                :class="[
                    'flex w-full items-center justify-between rounded-md px-6 py-4',
                    { 'sticky top-16 z-10 mb-4 rounded-b-none border-b border-zinc-200': open },
                    { 'bg-zinc-200': disabled },
                    { 'bg-white': !disabled },
                ]"
            >
                <div
                    v-if="!isEditingGroupName"
                    :class="[
                        '-mx-2 flex items-center gap-2 rounded px-2 py-1',
                        {
                            'bg-yellow-200 hover:bg-yellow-300 active:bg-yellow-400':
                                hasChangedGroupName && open,
                        },
                        {
                            'hover:bg-zinc-100 active:bg-zinc-200':
                                !hasChangedGroupName && open && !disabled,
                        },
                    ]"
                    @click="(e) => startEditingGroupName(e, open)"
                    :title="open ? 'Edit group name' : ''"
                    data-test="groupName"
                >
                    <RectangleStackIcon
                        :class="[
                            'h-5 w-5',
                            { 'text-zinc-300': disabled },
                            { 'text-zinc-400': !disabled },
                        ]"
                    />
                    <h2
                        :class="[
                            'font-medium',
                            { 'text-zinc-400': disabled },
                            { 'text-zinc-800': !disabled },
                        ]"
                    >
                        {{ editable.name }}
                    </h2>
                </div>
                <LInput
                    v-else
                    size="sm"
                    ref="groupNameInput"
                    name="groupName"
                    v-model="editable.name"
                    @blur="finishEditingGroupName"
                    @keyup.enter="finishEditingGroupName"
                    @keydown.enter.stop
                    @keydown.space.stop
                    @click.stop
                    class="mr-4 grow"
                    data-test="groupNameInput"
                />
                <div class="flex items-center gap-4">
                    <div v-if="isDirty && open && !disabled" class="-my-2 flex items-center gap-2">
                        <LButton
                            variant="tertiary"
                            size="sm"
                            context="danger"
                            @click.prevent="discardChanges"
                            data-test="discardChanges"
                        >
                            Discard changes
                        </LButton>
                        <LButton
                            v-if="hasEditPermission"
                            size="sm"
                            @click.prevent="saveChanges"
                            data-test="saveChanges"
                        >
                            Save changes
                        </LButton>
                    </div>

                    <LBadge v-if="isDirty && !open">Unsaved changes</LBadge>
                    <LBadge v-if="isEmpty" variant="warning" :customIcon="ExclamationCircleIcon">
                        The group does not have any access configured
                    </LBadge>
                    <LBadge
                        v-if="!hasEditPermission && !isEmpty"
                        variant="warning"
                        :customIcon="ExclamationCircleIcon"
                    >
                        Saving disabled: The group would not be editable</LBadge
                    >
                    <LBadge v-if="isLocalChange && !isConnected" variant="warning">
                        Offline changes
                    </LBadge>
                    <LButton
                        v-if="
                            groups &&
                            groups.length > 0 &&
                            open &&
                            !isDirty &&
                            !disabled &&
                            !isNewGroup
                        "
                        variant="muted"
                        size="sm"
                        title="Duplicate"
                        :icon="DocumentDuplicateIcon"
                        @click="duplicateGroup"
                        data-test="duplicateGroup"
                    />
                    <ChevronUpIcon :class="{ 'rotate-180 transform': !open }" class="h-5 w-5" />
                </div>
            </DisclosureButton>
            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-out"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <DisclosurePanel class="space-y-6 px-6 pb-10 pt-2">
                    <p>
                        <span v-if="!disabled">
                            Configure which permissions user members of the following groups have to
                            <strong>this</strong> group and its member documents.
                        </span>
                        <span v-else> No edit access. </span>
                        <span class="text-sm italic">
                            <br />Higher level groups may give more permissions (than configured
                            below) to this group and its members, depending on the permissions
                            granted to user members of the higher level groups.
                        </span>
                    </p>

                    <TransitionGroup
                        enter-active-class="transition ease duration-500"
                        enter-from-class="opacity-0 scale-90"
                        enter-to-class="opacity-100 scale-100"
                    >
                        <EditAclByGroup
                            v-for="assignedGroup in assignedGroups"
                            :key="assignedGroup._id"
                            :group="editable"
                            :assignedGroup="assignedGroup"
                            :originalGroup="group"
                            :availableGroups="availableGroups"
                            :disabled="disabled"
                        />
                    </TransitionGroup>

                    <div class="flex items-center justify-between">
                        <div>
                            <AddGroupAclButton
                                v-if="!disabled"
                                :groups="availableGroups"
                                @select="addAssignedGroup"
                            />
                        </div>
                        <LButton
                            variant="tertiary"
                            size="sm"
                            context="default"
                            @click.prevent="() => copyGroupId(group)"
                            data-test="copyGroupId"
                        >
                            Copy ID
                        </LButton>
                    </div>
                </DisclosurePanel>
            </transition>
        </Disclosure>

        <ConfirmBeforeLeavingModal :isDirty="isDirty" />
    </div>
</template>
