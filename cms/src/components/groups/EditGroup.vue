<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch, inject, defineEmits, type Ref } from "vue";
import {
    AclPermission,
    db,
    DocType,
    verifyAccess,
    AckStatus,
    type ChangeRequestQuery,
    type GroupDto,
    isConnected,
    getRest,
} from "luminary-shared";
import { DocumentDuplicateIcon, RectangleStackIcon } from "@heroicons/vue/20/solid";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import EditAclByGroup from "./EditAclByGroup.vue";
import { useNotificationStore } from "@/stores/notification";
import LBadge from "@/components/common/LBadge.vue";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import LInput from "../forms/LInput.vue";
import _ from "lodash";
import { compactAclEntries, validDocTypes } from "./permissions";

const { addNotification } = useNotificationStore();

type Props = {
    group: GroupDto;
    newGroups: GroupDto[];
};
const props = defineProps<Props>();
const groups = inject("groups") as Ref<Map<string, GroupDto>>;
let _groups: GroupDto[] = Object.values(Object.fromEntries(groups.value));
watch([groups.value], () => {
    _groups = Object.values(Object.fromEntries(groups.value));
});

const editable = ref<GroupDto>(_.cloneDeep(toRaw(props.group)));
const editableGroupWithoutEmpty = ref<GroupDto>(editable.value);
const originalGroupWithoutEmpty = ref<GroupDto>(props.group);

const emit = defineEmits<{
    (e: "duplicateGroup", group: GroupDto): void;
}>();

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
const groupNameInput = ref<HTMLInputElement>();

const assignedGroups = computed(() => {
    return _groups
        .filter((g) => editable.value.acl.some((acl) => acl.groupId == g._id))
        .sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
});

// Add empty aclEntries to "editable" per assigned group for a complete visual overview
watch(
    assignedGroups,
    (newAssignedGroups, oldAssignedGroups) => {
        // Get unique IDs of assigned groups not available to the user
        const unavailableGroupsIds = [
            ...Array.from(
                new Set(
                    props.group.acl
                        .map((a) => a.groupId)
                        .filter((g) => !_groups.some((gr) => gr._id == g)),
                ),
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
            newGroups = newAssignedGroups.filter(
                (g) => !oldAssignedGroups.some((o) => o._id == g._id),
            );
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
    },
    { immediate: true },
);

const availableGroups = computed(() => {
    return _groups.filter((g) => {
        if (editable.value.acl.some((acl) => acl.groupId == g._id)) return false;

        return verifyAccess([g._id], DocType.Group, AclPermission.Assign);
    });
});

const isDirty = computed(() => {
    if (props.newGroups.find((g) => g._id == props.group._id)) return true;
    return !_.isEqual(
        { ...toRaw(originalGroupWithoutEmpty.value), updatedTimeUtc: 0, _rev: "", updatedBy: "" },
        { ...toRaw(editableGroupWithoutEmpty.value), updatedTimeUtc: 0, _rev: "", updatedBy: "" },
    );
});

const hasChangedGroupName = computed(() => editable.value.name != props.group.name);
const isNewGroup = computed(() => !_groups.some((g) => g._id == props.group._id));
const isEmpty = computed(() => editableGroupWithoutEmpty.value.acl.length == 0);

const disabled = computed(() => {
    // Enable editing for new / unsaved groups
    if (isNewGroup.value) {
        return false;
    }

    return (
        // The user needs to have edit permissions to the group itself
        !verifyAccess([props.group._id], DocType.Group, AclPermission.Edit) ||
        // The user needs to have assign permissions to all assigned groups in the ACL
        !verifyAccess(
            props.group.acl.map((a) => a.groupId),
            DocType.Group,
            AclPermission.Assign,
            "all",
        )
    );
});

/**
 * Check if the user will have permission to edit the group
 */
const hasEditPermission = computed(() => {
    // Bypass this check if the group is not in edit mode
    if (!isDirty.value) return true;

    // Check if the user will have inherited permissions to edit the group
    const hasInheritedPermissions = verifyAccess(
        [
            ...Array.from(
                new Set(
                    editableGroupWithoutEmpty.value.acl
                        .map((a) => a.groupId)
                        .filter((g) => g != props.group._id),
                ),
            ),
        ],
        DocType.Group,
        AclPermission.Edit,
    );

    // Check if the ACL includes group edit permissions
    const editableAcl = editable.value.acl.some(
        (a) => a.type == DocType.Group && a.permission.includes(AclPermission.Edit),
    );

    return hasInheritedPermissions || editableAcl;
});

const startEditingGroupName = (e: Event) => {
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
    emit("duplicateGroup", duplicatedGroup);
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
    const res = await getRest().changeRequest({
        id: 10,
        doc: editableGroupWithoutEmpty.value,
    } as ChangeRequestQuery);

    res && res.ack == AckStatus.Accepted && groups.value.set(res.doc._id, res.doc);

    addNotification({
        title:
            res && res.ack == AckStatus.Accepted
                ? `${editableGroupWithoutEmpty.value.name} changes saved`
                : "Error saving changes",
        description:
            res && res.ack == AckStatus.Accepted
                ? "All changes are saved"
                : `Failed to save changes with error: ${res ? res.message : "Unknown error"}`,
        state: res && res.ack == AckStatus.Accepted ? "success" : "error",
    });
};
</script>

<template>
    <div
        :class="[
            'w-full overflow-visible rounded-md bg-white p-6 shadow',
            { 'bg-zinc-100': disabled },
        ]"
    >
        <div class="mb-6 flex items-center justify-between">
            <div
                v-if="!isEditingGroupName"
                :class="[
                    '-mx-2 flex items-center gap-2 rounded px-2 py-1',
                    {
                        'bg-yellow-200 hover:bg-yellow-300 active:bg-yellow-400':
                            hasChangedGroupName,
                    },
                    { 'hover:bg-zinc-100 active:bg-zinc-200': !hasChangedGroupName && !disabled },
                ]"
                @click="startEditingGroupName"
                :title="'Edit group name'"
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
                <div v-if="isDirty && !disabled" class="-my-2 flex items-center gap-2">
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
                        v-if="hasEditPermission && isConnected"
                        size="sm"
                        @click.prevent="saveChanges"
                        data-test="saveChanges"
                    >
                        Save changes
                    </LButton>
                </div>
                <LBadge v-if="isDirty">Unsaved changes</LBadge>
                <LBadge v-if="isEmpty" variant="warning" withIcon>
                    The group does not have any access configured
                </LBadge>
                <LBadge v-if="!hasEditPermission && !isEmpty" variant="warning" withIcon>
                    Saving disabled: The group would not be editable
                </LBadge>
                <LBadge v-if="!isConnected" variant="warning" withIcon>
                    Saving disabled: Unable to save while offline
                </LBadge>
                <LButton
                    v-if="_groups && _groups.length > 0 && !isDirty && !disabled && !isNewGroup"
                    variant="muted"
                    size="sm"
                    title="Duplicate"
                    :icon="DocumentDuplicateIcon"
                    @click="duplicateGroup"
                    data-test="duplicateGroup"
                />
            </div>
        </div>
        <div class="space-y-6">
            <p>
                <span v-if="!disabled">
                    Configure which permissions user members of the following groups have to
                    <strong>this</strong> group and its member documents.
                </span>
                <span v-else> No edit access. </span>
                <span class="text-sm italic">
                    <br />User members of higher level groups may have more permissions (than
                    configured below) to this group and its members by inheritance, depending on the
                    permissions granted by the higher level groups.
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
                    v-model:group="editable"
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
        </div>
        <ConfirmBeforeLeavingModal :isDirty="isDirty" />
    </div>
</template>
