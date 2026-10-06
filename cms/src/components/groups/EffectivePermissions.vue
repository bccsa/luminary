<script setup lang="ts">
import { capitaliseFirstLetter, getTheFirstLetter } from "@/util/string";
import DisplayCard from "@/components/common/DisplayCard.vue";
import type { AccessorReport } from "./EffectivePermissions";
import { isMobileScreen } from "@/globalConfig";

defineProps<{
    entry: AccessorReport;
}>();
</script>

<template>
    <DisplayCard
        :title="``"
        :updatedTimeUtc="0"
        class="rounded-md border !px-0 !py-0"
        :disable="true"
    >
        <template #content>
            <div class="flex items-center justify-between">
                <div
                    :class="[
                        'flex-shrink-0 whitespace-nowrap pl-3 text-sm text-zinc-500',
                        { 'text-xs': isMobileScreen },
                    ]"
                >
                    {{ entry.accessorGroupName }}
                </div>
                <div v-if="entry.inheritedViaGroupName" class="mr-2 text-xs italic text-zinc-400">
                    via {{ entry.inheritedViaGroupName }}
                </div>
            </div>
            <div class="group relative py-1">
                <div class="mx-1 flex gap-1 overflow-x-auto scrollbar-hide">
                    <template v-for="(permissions, type) in entry.permissionsByDocType" :key="type">
                        <div
                            v-if="permissions.length > 0"
                            class="flex flex-shrink-0 items-baseline rounded-md border border-zinc-100 bg-slate-400 bg-opacity-10 px-2 py-0.5 text-xs font-medium text-zinc-400"
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
</template>
