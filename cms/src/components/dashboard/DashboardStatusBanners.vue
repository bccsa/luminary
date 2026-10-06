<script setup lang="ts">
import { isConnected, type ContentDto, type LocalChangeDto } from "luminary-shared";
import { ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/vue/20/solid";

defineProps<{
    pendingChanges: LocalChangeDto[];
    expiredContent: ContentDto[];
}>();
</script>

<template>
    <div v-if="pendingChanges.length > 0 || expiredContent.length > 0" class="flex flex-wrap gap-2">
        <div
            v-if="pendingChanges.length > 0"
            class="flex flex-1 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5"
        >
            <ArrowPathIcon class="h-4 w-4 shrink-0 text-amber-500" />
            <p class="text-xs font-medium text-amber-800">
                {{ pendingChanges.length }} pending change{{
                    pendingChanges.length !== 1 ? "s" : ""
                }}
            </p>
            <p class="text-xs text-amber-600">
                {{ isConnected ? "Syncing with server..." : "Will sync when back online" }}
            </p>
        </div>
        <div
            v-if="expiredContent.length > 0"
            class="flex flex-1 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5"
        >
            <ExclamationTriangleIcon class="h-4 w-4 shrink-0 text-orange-500" />
            <p class="text-xs font-medium text-orange-800">
                {{ expiredContent.length }} expired item{{ expiredContent.length !== 1 ? "s" : "" }}
            </p>
            <p class="text-xs text-orange-600">Content past its expiry date</p>
        </div>
    </div>
</template>
