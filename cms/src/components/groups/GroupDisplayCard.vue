<script setup lang="ts">
import { db, type GroupDto, ApiLiveQueryAsEditable } from "luminary-shared";
import LBadge from "../common/LBadge.vue";
import DisplayCard from "../common/DisplayCard.vue";
import { computed, ref } from "vue";
import { ClockIcon } from "@heroicons/vue/24/outline";
import EditGroup from "./EditGroup.vue";
import { DateTime } from "luxon";
import { isSmallScreen } from "@/globalConfig";

type Props = {
    groupQuery: ApiLiveQueryAsEditable<GroupDto>;
    groups?: GroupDto;
};
const props = defineProps<Props>();

const { isModified, liveData } = props.groupQuery;

/** The group document to be shown in this component */
const group = defineModel<GroupDto>("group", { required: true });

defineEmits<{
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
        <template #content>
            <div class="flex items-center justify-between pt-1">
                <div class="flex flex-wrap gap-1">
                    <LBadge v-for="name in accessGroupNames" :key="name">
                        {{ name }}
                    </LBadge>
                </div>
                <div class="flex">
                    <LBadge v-if="isModified(group._id)" variant="warning">Incoming edit</LBadge>
                </div>
            </div>
        </template>

        <template #topRightContent>
            <div class="flex items-center justify-end text-xs text-zinc-400">
                <ClockIcon class="mr-[2px] h-4 w-4 text-zinc-400" />
                <span title="Last Updated" class="whitespace-nowrap">
                    {{
                        db
                            .toDateTime(group.updatedTimeUtc)
                            .toLocaleString(
                                isSmallScreen ? DateTime.DATE_SHORT : DateTime.DATETIME_SHORT,
                            )
                    }}
                </span>
            </div>
        </template>
    </DisplayCard>
    <EditGroup
        v-if="showEditModal"
        :openModal="showEditModal"
        v-model:group="group"
        :groupQuery="groupQuery"
        @close="showEditModal = false"
    />
</template>
