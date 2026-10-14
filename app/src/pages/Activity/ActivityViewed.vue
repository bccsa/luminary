<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import { EyeIcon } from "@heroicons/vue/24/solid";
import ActivityCard from "./ActivityCard.vue";
import { removeUserActivity } from "@/userActivity/store";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";

const { t } = useI18n();

const viewed = useUserActivity("viewed");
const parentIds = computed(() => viewed.value.map((row) => row.parentId));

const content = useContentQuery(() => [{ parentId: { $in: parentIds.value } }], {
    includeScheduled: false,
    keepPreviousResult: true,
});

const sorted = computed(
    () =>
        parentIds.value
            .map((id) => content.value.find((c) => c.parentId === id))
            .filter((c) => c !== undefined) as ContentDto[],
);
</script>

<template>
    <div data-test="activity-viewed">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <div
                v-for="item in sorted"
                :key="item._id"
                class="relative"
            >
                <ActivityCard
                    :content="item"
                    type="viewed"
                    removable
                    class="h-full"
                    @remove="removeUserActivity({ type: 'viewed', parentId: item.parentId })"
                />
                <!-- Top-right marker for a viewed card. Decorative, so it never intercepts the
                     card's click. Same size and right edge as the trash icon below it. -->
                <span
                    class="pointer-events-none absolute right-2.5 top-2"
                    data-test="activity-viewed-icon"
                >
                    <EyeIcon
                        class="h-4 w-4 text-zinc-500 dark:text-yellow-400"
                        aria-hidden="true"
                    />
                </span>
            </div>
        </div>
        <div
            v-if="!sorted.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.viewed.empty_page") }}
        </div>
    </div>
</template>
