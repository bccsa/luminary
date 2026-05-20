<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { RouterLink } from "vue-router";
import { DocType, PublishStatus, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import LCard from "@/components/common/LCard.vue";
import LBadge from "@/components/common/LBadge.vue";
import { ClockIcon, DocumentTextIcon, TagIcon } from "@heroicons/vue/20/solid";
import { parentRoute } from "@/util/parentRoute";
import { useListCapacity } from "@/composables/useListCapacity";

const props = defineProps<{
    contentDocs: ContentDto[];
}>();

const { listEl, capacity, update } = useListCapacity();

const recentContent = computed(() =>
    [...props.contentDocs]
        .sort((a, b) => b.updatedTimeUtc - a.updatedTimeUtc)
        .slice(0, Math.min(capacity.value, 50)),
);

watch(recentContent, () => nextTick(update));

function formatRelativeTime(timestamp: number): string {
    return DateTime.fromMillis(timestamp).toRelative() ?? "";
}
</script>

<template>
    <LCard title="Recent activity" :icon="ClockIcon" fillHeight class="-mx-1 lg:mx-0">
        <div v-if="recentContent.length === 0" class="py-6 text-center text-sm text-zinc-400">
            No content found for the selected language.
        </div>
        <ul v-else ref="listEl" class="-mx-1.5 divide-y divide-zinc-100 lg:mx-0">
            <li
                v-for="doc in recentContent"
                :key="doc._id"
                class="rounded-lg p-1.5 hover:bg-zinc-100"
            >
                <RouterLink
                    class="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 sm:grid-cols-[20px_1fr_150px_100px_80px] sm:gap-x-0"
                    :to="parentRoute(doc)!"
                >
                    <component
                        :is="doc.parentType === DocType.Post ? DocumentTextIcon : TagIcon"
                        class="h-4 w-4 shrink-0 text-zinc-300"
                    />
                    <span
                        v-if="parentRoute(doc)"
                        class="min-w-0 truncate text-sm font-medium text-zinc-900 hover:text-yellow-600"
                    >
                        {{ doc.title || "Untitled" }}
                    </span>
                    <span v-else class="min-w-0 truncate text-sm font-medium text-zinc-900">
                        {{ doc.title || "Untitled" }}
                    </span>
                    <span
                        v-if="doc.author"
                        class="hidden truncate text-right text-xs text-zinc-400 sm:col-start-3 sm:inline"
                    >
                        by {{ doc.author }}
                    </span>
                    <div v-else class="hidden sm:col-start-3 sm:block"></div>
                    <span class="text-right text-xs text-zinc-400 sm:col-start-4">
                        {{ formatRelativeTime(doc.updatedTimeUtc) }}
                    </span>
                    <LBadge
                        :variant="doc.status === PublishStatus.Published ? 'success' : 'default'"
                        paddingY="py-0.5"
                        paddingX="px-1.5"
                        class="justify-self-end sm:col-start-5"
                    >
                        {{ doc.status }}
                    </LBadge>
                </RouterLink>
            </li>
        </ul>
    </LCard>
</template>
