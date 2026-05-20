<script setup lang="ts">
import { RouterLink } from "vue-router";
import { type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import LCard from "@/components/common/LCard.vue";
import { CalendarDaysIcon } from "@heroicons/vue/20/solid";
import { parentRoute } from "@/util/parentRoute";

defineProps<{
    scheduledContent: ContentDto[];
}>();

function formatDate(timestamp: number): string {
    return DateTime.fromMillis(timestamp).toLocaleString(DateTime.DATE_MED);
}
</script>

<template>
    <LCard
        v-if="scheduledContent.length > 0"
        title="Upcoming scheduled"
        :icon="CalendarDaysIcon"
        collapsible
        defaultCollapsed
        class="-mx-1 lg:mx-0"
    >
        <ul class="divide-y divide-zinc-100">
            <li
                v-for="doc in scheduledContent.slice(0, 5)"
                :key="doc._id"
                class="flex items-center justify-between gap-3 py-1.5"
            >
                <div class="min-w-0 flex-1">
                    <RouterLink
                        v-if="parentRoute(doc)"
                        :to="parentRoute(doc)!"
                        class="truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                    >
                        {{ doc.title || "Untitled" }}
                    </RouterLink>
                    <span v-else class="truncate text-sm font-medium text-zinc-900">
                        {{ doc.title || "Untitled" }}
                    </span>
                </div>
                <span class="shrink-0 text-xs text-zinc-500">
                    {{ formatDate(doc.publishDate!) }}
                </span>
            </li>
        </ul>
    </LCard>
</template>
