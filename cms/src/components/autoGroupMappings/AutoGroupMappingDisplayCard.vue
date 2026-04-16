<script setup lang="ts">
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { UserGroupIcon } from "@heroicons/vue/20/solid";
import { KeyIcon, GlobeAltIcon } from "@heroicons/vue/24/outline";
import type { AutoGroupMappingsDto, GroupDto } from "luminary-shared";
import { computed } from "vue";

const props = defineProps<{
    mapping: AutoGroupMappingsDto;
    groups: GroupDto[];
    providerName?: string;
}>();

defineEmits<{
    click: [];
}>();

const isGlobal = computed(() => !props.mapping.providerId);

const assignedGroups = computed(() =>
    (props.mapping.groupIds ?? [])
        .map((id) => props.groups.find((g) => g._id === id))
        .filter(Boolean),
);

const displayTitle = computed(() =>
    props.mapping.description?.trim() || (isGlobal.value ? "Global group access" : "Untitled mapping"),
);

const badgeIcon = computed(() => (isGlobal.value ? GlobeAltIcon : KeyIcon));
const badgeLabel = computed(() =>
    isGlobal.value ? "All Users" : (props.providerName || ""),
);
</script>

<template>
    <DisplayCard
        :title="displayTitle"
        :updated-time-utc="0"
        :show-date="false"
        @click="$emit('click')"
        class="mb-1"
    >
        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <LBadge v-if="badgeLabel" :icon="badgeIcon" withIcon variant="default">
                    {{ badgeLabel }}
                </LBadge>
                <UserGroupIcon class="size-4 text-zinc-400" />
                <LBadge
                    v-for="group in assignedGroups"
                    :key="group!._id"
                    type="default"
                    variant="blue"
                >
                    {{ group!.name }}
                </LBadge>
                <span v-if="assignedGroups.length === 0" class="text-xs text-zinc-400">
                    No groups assigned
                </span>
            </div>
        </template>

        <template #mobileFooter>
            <div class="flex flex-1 items-center gap-1">
                <LBadge v-if="badgeLabel" :icon="badgeIcon" withIcon variant="default">
                    {{ badgeLabel }}
                </LBadge>
                <UserGroupIcon class="size-4 text-zinc-400" />
                <div class="flex flex-wrap gap-1">
                    <LBadge
                        v-for="group in assignedGroups"
                        :key="group!._id"
                        type="default"
                        variant="blue"
                    >
                        {{ group!.name }}
                    </LBadge>
                    <span v-if="assignedGroups.length === 0" class="text-xs text-zinc-400">
                        No groups assigned
                    </span>
                </div>
            </div>
        </template>
    </DisplayCard>
</template>
