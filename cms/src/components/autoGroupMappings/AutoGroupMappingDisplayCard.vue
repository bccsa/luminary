<script setup lang="ts">
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { UserGroupIcon } from "@heroicons/vue/20/solid";
import { KeyIcon } from "@heroicons/vue/24/outline";
import type { AutoGroupMappingsDto, AuthProviderCondition, GroupDto } from "luminary-shared";
import { computed } from "vue";

type MappingLike = AutoGroupMappingsDto | { _id: string; groupIds: string[]; conditions: AuthProviderCondition[] };

const props = defineProps<{
    mapping: MappingLike;
    groups: GroupDto[];
    providerName?: string;
    isDefaultPermissions?: boolean;
}>();

defineEmits<{
    click: [];
}>();

const assignedGroups = computed(() =>
    (props.mapping.groupIds ?? [])
        .map((id) => props.groups.find((g) => g._id === id))
        .filter(Boolean),
);

const conditionSummary = computed(() => {
    if (props.isDefaultPermissions) return "All authenticated and unauthenticated users";
    const conditions = props.mapping.conditions ?? [];
    if (conditions.length === 0) return "All authenticated users";
    return conditions
        .map((c) => {
            if (c.type === "authenticated") return "Authenticated";
            if (c.type === "claimEquals") return `${c.claimPath} = ${c.value}`;
            if (c.type === "claimIn") return `${c.claimPath} IN [${(c.values ?? []).join(", ")}]`;
            return "";
        })
        .filter(Boolean)
        .join(" OR ");
});
</script>

<template>
    <DisplayCard
        :title="conditionSummary"
        :updated-time-utc="0"
        :show-date="false"
        @click="$emit('click')"
        class="mb-1"
    >
        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <LBadge v-if="providerName" :icon="KeyIcon" withIcon variant="default">
                    {{ providerName }}
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
                <LBadge v-if="providerName" :icon="KeyIcon" type="default" variant="default">
                    {{ providerName }}
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
