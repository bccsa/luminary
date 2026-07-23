<script setup lang="ts">
import { computed } from "vue";
import { buildEffectivePermissionsReport } from "@/components/groups/GroupPermissionsReport";
import type { GroupDto } from "luminary-shared";
import LBadge from "@/components/common/LBadge.vue";
import { capitaliseFirstLetter, getTheFirstLetter } from "@/util/string";
import DisplayCard from "@/components/common/DisplayCard.vue";

const props = defineProps<{
    groupId: string;
    allGroups: GroupDto[];
    groupName: string;
}>();

const activeAclEntries = computed(() => {
    if (!props.groupId) return [];

    const report = buildEffectivePermissionsReport(props.groupId, props.allGroups);

    return report.filter((entry) => {
        return Object.values(entry.permissionsByDocType).some(
            (permissions) => permissions.length > 0,
        );
    });
});
</script>

<template>
    <div class="max-h-[30vh] overflow-y-auto">
        <p v-if="activeAclEntries.length === 0" class="text-center text-zinc-500">
            No group has explicit access to this group.
        </p>

        <div
            v-for="data in activeAclEntries"
            :key="data.path?.join('->') || data.accessorGroupId"
            class="mb-1"
        >
            <DisplayCard :title="``" :updatedTimeUtc="0" class="cursor-default rounded-md border">
                <template #content>
                    <div class="flex items-center justify-between">
                        <div class="flex-shrink-0 whitespace-nowrap pl-3 text-sm">
                            {{ data.accessorGroupName }}
                        </div>
                        <div v-if="data.inheritedViaGroupName" class="text-xs italic text-zinc-400">
                            <LBadge
                                :variant="data.source === 'direct' ? 'blue' : 'info'"
                                class="ml-2"
                            >
                                {{ data.source === "direct" ? "Direct Access" : "Inherited" }}
                            </LBadge>
                            via {{ data.inheritedViaGroupName }}
                        </div>
                    </div>
                    <div class="group relative py-1">
                        <div class="mx-1 flex gap-1 overflow-x-auto scrollbar-hide">
                            <template
                                v-for="(permissions, type) in data.permissionsByDocType"
                                :key="type"
                            >
                                <div
                                    v-if="permissions.length > 0"
                                    class="flex flex-shrink-0 items-baseline rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600"
                                >
                                    <span>{{ capitaliseFirstLetter(type) }}</span>
                                    <span class="ml-0.5 text-[9px]">
                                        (<span v-for="permission in permissions" :key="permission">
                                            {{
                                                getTheFirstLetter(capitaliseFirstLetter(permission))
                                            }} </span
                                        >)
                                    </span>
                                </div>
                            </template>
                        </div>
                    </div>
                </template>
            </DisplayCard>
        </div>
    </div>
</template>
