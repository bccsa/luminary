<script setup lang="ts">
import {
    type GroupDto,
    ApiLiveQueryAsEditable,
    // getRest,
    // type ChangeRequestQuery,
    // AckStatus,
} from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import DisplayCard from "../common/DisplayCard.vue";
import { computed, ref } from "vue";
import LModal from "../modals/LModal.vue";
import EditGroup from "./EditGroup.vue";

type Props = {
    groupQuery: ApiLiveQueryAsEditable<GroupDto>;
    groups?: GroupDto;
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

// Calculate the groups which has access to this group
const accessGroupNames = computed(() => {
    const groupIds = group.value.acl.map((a) => a.groupId);
    const uniqueGroupIds = Array.from(new Set(groupIds));
    return uniqueGroupIds.map((id) => liveData.value.find((g) => g._id === id)?.name || id);
});
</script>

<template>
    <DisplayCard
        :title="group.name"
        :updatedTimeUtc="group.updatedTimeUtc"
        @click="showEditModal = true"
        class="mb-1"
    >
        <template #desktopFooter>
            <div>
                <LBadge v-for="name in accessGroupNames" :key="name">
                    {{ name }}
                </LBadge>
            </div>
        </template>

        <template #topRightContent>
            <div class="flex">
                <LBadge v-if="isEdited(group._id)" variant="info">Edited</LBadge>
                <LBadge v-if="isModified(group._id)" variant="warning">Incoming edit</LBadge>
            </div>
        </template>
    </DisplayCard>

    <LModal heading="Edit Group" v-model:isVisible="showEditModal" adaptiveSize noPadding>
        <EditGroup v-model:group="group" :groupQuery="groupQuery" />
    </LModal>
</template>
