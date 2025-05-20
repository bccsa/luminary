<script setup lang="ts">
import {
    db,
    DocType,
    type GroupDto,
    AclPermission,
    verifyAccess,
    getRest,
    type ChangeRequestQuery,
    AckStatus,
} from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LModal from "../modals/LModal.vue";
import EditGroup from "./EditGroup.vue";
import { useNotificationStore } from "@/stores/notification";

type Props = {
    groupsDoc: GroupDto;
    accessToGroup: GroupDto[];
};
const props = defineProps<Props>();

const isLocalChanges = db.isLocalChangeAsRef(props.groupsDoc._id);
const openModal = ref(false);

/**
 * Check if the user will have permission to edit the group
 */
const hasEditPermission = computed(() => {
    // Bypass this check if the group is not in edit mode

    // Check if the user will have inherited permissions to edit the group (exclude self-assigned permissions)
    const hasInheritedPermissions = verifyAccess(
        [
            ...Array.from(
                new Set(
                    props.groupsDoc.acl
                        .map((a) => a.groupId)
                        .filter((g) => g != props.groupsDoc._id),
                ),
            ),
        ],
        DocType.Group,
        AclPermission.Edit,
    );

    // Check if the ACL includes group edit permissions.
    // We here rely on the available groups already being filtered with groups to which the user has assign permissions
    const editableAcl = props.groupsDoc.acl.some(
        (a) => a.type == DocType.Group && a.permission.includes(AclPermission.Edit),
    );

    return hasInheritedPermissions || editableAcl;
});

const handleDuplicateGroup = async (duplicatedGroup: GroupDto) => {
    console.log("Duplicated group:", duplicatedGroup); // Debug log
    try {
        const res = await getRest().changeRequest({
            id: 10, // Adjust ID as needed
            doc: duplicatedGroup,
        } as ChangeRequestQuery);
        if (res && res.ack === AckStatus.Accepted) {
            console.log("Duplicated group saved:", res.doc);
            openModal.value = false; // Close the modal after saving

            // Optionally show a notification
            useNotificationStore().addNotification({
                title: "Group duplicated",
                description: `The group ${res.doc.name} has been duplicated successfully.`,
                state: "success",
            });
        } else {
            console.error("Failed to save duplicated group:", res?.message);
            // Optionally show a notification
            // addNotification({ title: "Error", description: res?.message, state: "error" });
        }
    } catch (error) {
        console.error("Error duplicating group:", error);
    }
};
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                {{ groupsDoc.name }}
            </div>
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <!-- Optional status handling -->
            <LBadge v-if="isLocalChanges" variant="warning">Offline changes</LBadge>
        </td>

        <!-- Have access to -->
        <td
            class="whitespace-wrap space-x-3 py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LBadge v-for="group in accessToGroup" :key="group._id">
                {{ group.name }}
            </LBadge>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(groupsDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                variant="tertiary"
                :icon="hasEditPermission ? PencilSquareIcon : EyeIcon"
                @click="openModal = true"
                class="flex justify-end"
            />
        </td>
    </tr>

    <LModal v-model:isVisible="openModal" adaptiveSize noPadding>
        <EditGroup
            :group="groupsDoc"
            :newGroups="[]"
            :isLocalChanges="isLocalChanges"
            :hasEditPermission="hasEditPermission"
            @close="openModal = false"
            @save="openModal = false"
            @delete="openModal = false"
            @deleteGroup="openModal = false"
            @duplicateGroup="handleDuplicateGroup"
        />
    </LModal>
</template>
