<script setup lang="ts">
import { ExclamationTriangleIcon } from "@heroicons/vue/20/solid";
import type { GroupDto } from "luminary-shared";

/**
 * Warns that groups able to view a document cannot read something it depends on.
 * Callers get `groups` from `groupsMissingDependencyAccess`.
 */
defineProps<{
    groups: GroupDto[];
    /** What the groups cannot reach, and what that breaks, in plain words. */
    subject: string;
}>();
</script>

<template>
    <div
        v-if="groups.length"
        class="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
    >
        <ExclamationTriangleIcon class="h-5 w-5 flex-shrink-0 text-yellow-500" />
        <span>
            Members of {{ groups.map((g) => g.name).join(", ") }} can view this but do not have
            access to {{ subject }}. Give these groups View access to Storage on the bucket's group.
        </span>
    </div>
</template>
