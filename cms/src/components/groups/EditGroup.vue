<script setup lang="ts">
import { computed, nextTick, ref, toRaw } from "vue";
import {
    AclPermission,
    DocType,
    verifyAccess,
    AckStatus,
    type GroupDto,
    isConnected,
    ApiLiveQueryAsEditable,
    db,
} from "luminary-shared";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import LButton from "@/components/button/LButton.vue";
import EditAclByGroup from "./EditAclByGroup.vue";
import { useNotificationStore } from "@/stores/notification";
import LBadge from "@/components/common/LBadge.vue";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import LInput from "../forms/LInput.vue";
import { DocumentDuplicateIcon } from "@heroicons/vue/24/outline";
import LDialog from "../common/LDialog.vue";
import { ArrowUturnLeftIcon } from "@heroicons/vue/24/solid";
import { isMobileScreen } from "@/globalConfig";

const { addNotification } = useNotificationStore();

type Props = {
    groupQuery: ApiLiveQueryAsEditable<GroupDto>;
    openModal: boolean;
};
const props = defineProps<Props>();

const group = defineModel<GroupDto>("group", { required: true });
const { liveData, isEdited, revert, save, duplicate } = props.groupQuery;

const isDirty = computed(() => {
    // Check if the group has been modified
    return isEdited.value(group.value._id);
});

const isEditingGroupName = ref(false);
const groupNameInput = ref<HTMLInputElement>();

const assignedGroups = computed(() => {
    return liveData.value
        .filter((g) => group.value.acl.some((acl) => acl.groupId == g._id))
        .sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
});

const availableGroups = computed(() => {
    return liveData.value.filter((g) => {
        if (group.value.acl.some((acl) => acl.groupId == g._id)) return false;

        return verifyAccess([g._id], DocType.Group, AclPermission.Assign);
    });
});

const original = computed(() => {
    return liveData.value.find((g) => g._id == group.value._id);
});
const isNewGroup = computed(() => !original.value);

const hasChangedGroupName = computed(() => {
    if (!original.value) return false;
    return original.value.name != group.value.name;
});

const isEmpty = computed(() => {
    return (
        group.value.acl.length == 0 || group.value.acl.every((acl) => acl.permission.length == 0)
    );
});

const disabled = computed(() => {
    // Enable editing for new / unsaved groups
    if (isNewGroup.value) {
        return false;
    }

    return (
        // The user needs to have edit permissions to the group itself
        !verifyAccess([group.value._id], DocType.Group, AclPermission.Edit) ||
        // The user needs to have assign permissions to all assigned groups in the ACL
        !verifyAccess(
            group.value.acl.map((a) => a.groupId),
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
    // TODO: Why would we do this?
    if (!isDirty.value) return true;

    // Check if the user will have inherited permissions to edit the group
    const hasInheritedPermissions = verifyAccess(
        [
            ...Array.from(
                new Set(group.value.acl.map((a) => a.groupId).filter((g) => g != group.value._id)),
            ),
        ],
        DocType.Group,
        AclPermission.Edit,
    );

    // Check if the ACL includes group edit permissions
    const editableAcl = group.value.acl.some(
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
    console.log("Discarding changes");
    revert(group.value._id);
};

const addAssignedGroup = (selectedGroup: GroupDto) => {
    // Add one empty ACL entry with the group ID. The ApiLiveQueryAsEditable's modifyFn function will populate it with the needed empty entries.
    group.value.acl.push({
        groupId: selectedGroup._id,
        type: DocType.Group,
        permission: [],
    });
};

const emit = defineEmits(["close"]);

const duplicateGroup = async () => {
    if (!original.value) {
        addNotification({
            title: "Error duplicating group",
            description: "Please try saving before duplicating this group",
            state: "error",
        });

        return;
    }

    const duplicatedGroup: GroupDto = { ...toRaw(original.value), _id: db.uuid() };
    duplicatedGroup.name = `${duplicatedGroup.name} - copy`;

    const res = await duplicate(duplicatedGroup);

    addNotification({
        title:
            res && res.ack == AckStatus.Accepted
                ? `${group.value.name} duplicated`
                : "Error duplicating group",
        description:
            res && res.ack == AckStatus.Accepted
                ? `${group.value.name} duplicated as ${duplicatedGroup.name}}`
                : `Failed to duplicate group with error: ${res ? res.message : "Unknown error"}`,
        state: res && res.ack == AckStatus.Accepted ? "success" : "error",
    });
};

let res = ref<undefined | any>(undefined);

const saveChanges = async () => {
    res.value = await save(group.value._id);

    addNotification({
        title:
            res.value && res.value.ack == AckStatus.Accepted
                ? `${group.value.name} changes saved`
                : "Error saving changes",
        description:
            res.value && res.value.ack == AckStatus.Accepted
                ? "All changes are saved"
                : `Failed to save changes with error: ${res.value ? res.value.message : "Unknown error"}`,
        state: res.value && res.value.ack == AckStatus.Accepted ? "success" : "error",
    });
    emit("close");
};
</script>

<template>
    <LDialog
        title=""
        :open="openModal"
        @update:open="(val) => !val && emit('close')"
        :primaryAction="saveChanges"
        primaryButtonText="Save"
        :primaryButtonDisabled="!hasEditPermission || !isConnected || !isDirty"
        @close="emit('close')"
        largeModal
    >
        <template #headingExtension>
            <div
                v-if="!isEditingGroupName"
                :class="[
                    'mr-4 flex items-center gap-2 rounded',
                    {
                        'bg-yellow-200 hover:bg-yellow-300 active:bg-yellow-400':
                            hasChangedGroupName,
                    },
                    {
                        'hover:bg-zinc-100 active:bg-zinc-200': !hasChangedGroupName && !disabled,
                    },
                ]"
                @click="startEditingGroupName"
                :title="'Edit group name'"
                data-test="groupName"
            >
                <h2
                    :class="[
                        'font-semibold',
                        { 'text-zinc-400': disabled },
                        { 'text-zinc-800': !disabled },
                    ]"
                >
                    {{ group.name }}
                </h2>
            </div>
            <LInput
                v-else
                size="sm"
                ref="groupNameInput"
                name="groupName"
                v-model="group.name"
                @blur="finishEditingGroupName"
                @keyup.enter="finishEditingGroupName"
                @keydown.enter.stop
                @keydown.space.stop
                @click.stop
                class="mr-4 grow"
                data-test="groupNameInput"
            />
        </template>
        <template #rightHeading>
            <div class="mb-2 flex items-center gap-2">
                <LBadge v-if="isDirty" variant="warning" withIcon>Unsaved changes</LBadge>
                <LBadge v-if="!hasEditPermission && !isEmpty" variant="warning" withIcon>
                    Saving disabled: The group would not be editable
                </LBadge>
                <LBadge v-if="isEmpty" variant="warning" withIcon>
                    The group does not have any access configured
                </LBadge>
            </div>
        </template>

        <div :class="['w-full ', { 'bg-zinc-100': disabled }]">
            <div class="space-y-1">
                <TransitionGroup
                    enter-active-class="transition ease duration-500"
                    enter-from-class="opacity-0 scale-90"
                    enter-to-class="opacity-100 scale-100"
                >
                    <EditAclByGroup
                        v-for="assignedGroup in assignedGroups"
                        :key="assignedGroup._id"
                        v-model:group="group"
                        :assignedGroup="assignedGroup"
                        :originalGroup="group"
                        :availableGroups="availableGroups"
                        :disabled="disabled"
                    />
                </TransitionGroup>
                <div class="flex w-full items-center justify-between pb-4 pt-2">
                    <div class="mr-3">
                        <AddGroupAclButton
                            v-if="!disabled"
                            :groups="availableGroups"
                            @select="addAssignedGroup"
                        />
                    </div>
                    <div class="max-w-[170px]">
                        <LBadge v-if="!isConnected" variant="warning" withIcon>
                            Saving disabled: Unable to save while offline
                        </LBadge>
                    </div>
                </div>
            </div>
            <!-- TODO: We need a way to intercept closing the modal and showing a confirmation dialog -->
            <ConfirmBeforeLeavingModal :isDirty="isDirty" />
        </div>
        <template #footer-extra>
            <div class="mb-1 flex">
                <LButton
                    v-if="
                        groupQuery.editable &&
                        groupQuery.editable.value.length > 0 &&
                        !isDirty &&
                        !disabled &&
                        !isNewGroup
                    "
                    variant="secondary"
                    size="sm"
                    title="Duplicate"
                    :icon="DocumentDuplicateIcon"
                    @click="duplicateGroup"
                    data-test="duplicateGroup"
                    s
                >
                    Duplicate
                </LButton>
                <div v-if="isDirty && !disabled" class="-my-2 flex items-center gap-2">
                    <LButton
                        variant="secondary"
                        size="sm"
                        @click.prevent="discardChanges"
                        data-test="discardChanges"
                        :icon="ArrowUturnLeftIcon"
                        :class="isMobileScreen ? '!px-2 !py-1 text-xs' : ''"
                        smallIcon
                    >
                        Revert
                    </LButton>
                </div>
            </div>
        </template>
    </LDialog>
</template>
