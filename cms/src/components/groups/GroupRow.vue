<script setup lang="ts">
import {
    db,
    DocType,
    type GroupDto,
    AclPermission,
    verifyAccess,
    ApiLiveQueryAsEditable,
    // getRest,
    // type ChangeRequestQuery,
    // AckStatus,
} from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import LButton from "../button/LButton.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LModal from "../modals/LModal.vue";
import EditGroup from "./EditGroup.vue";

type Props = {
    groupQuery: ApiLiveQueryAsEditable<GroupDto>;
};
const props = defineProps<Props>();

const { isEdited, isModified, liveData } = props.groupQuery;

/** The group document to be shown in this component */
const group = defineModel<GroupDto>("group", { required: true });

defineEmits<{
    // (e: "showEditModal", group: GroupDto): void;
    (e: "save", group: GroupDto): void;
    (e: "delete", group: GroupDto): void;
    (e: "duplicate", group: GroupDto): void;
}>();

const showEditModal = ref(false);

/**
 * Check if the user will have permission to edit the group
 */
const canEdit = computed(() => {
    return verifyAccess([group.value._id], DocType.Group, AclPermission.Edit);
});

// Calculate the groups which has access to this group
const accessGroupNames = computed(() => {
    const groupIds = group.value.acl.map((a) => a.groupId);
    const uniqueGroupIds = Array.from(new Set(groupIds));
    return uniqueGroupIds.map((id) => liveData.value.find((g) => g._id === id)?.name || id);
});
</script>

<template>
    <tr>
        <!-- name -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <div class="flex gap-2">
                {{ group.name }}
            </div>
        </td>

        <!-- status -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            <LBadge v-if="isEdited(group._id)" variant="info">Edited</LBadge>
            <LBadge v-if="isModified(group._id)" variant="warning">Incoming edit</LBadge>
        </td>

        <!-- Have access to -->
        <td
            class="whitespace-wrap space-x-3 py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LBadge v-for="name in accessGroupNames" :key="name">
                {{ name }}
            </LBadge>
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(group.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                variant="tertiary"
                :icon="canEdit ? PencilSquareIcon : EyeIcon"
                class="flex justify-end"
                @click="showEditModal = true"
            />
        </td>
    </tr>

    <LModal heading="Edit Group" v-model:isVisible="showEditModal" adaptiveSize noPadding>
        <EditGroup v-model:group="group" :groupQuery="groupQuery" />
    </LModal>
</template>
