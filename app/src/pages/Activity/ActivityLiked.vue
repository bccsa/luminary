<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";

const { t } = useI18n();

const likes = useUserActivity("liked");
const liked = computed(() => likes.value.map((row) => row.parentId));

const content = useContentQuery(() => [{ parentId: { $in: liked.value } }], {
    includeScheduled: false,
    // Adding or removing an entry re-narrows this same list, so keep the tiles on
    // screen instead of blanking the panel on every toggle.
    keepPreviousResult: true,
});

const sorted = computed(
    () =>
        liked.value
            .map((id) => content.value.find((c) => c.parentId === id))
            .filter((c) => c !== undefined) as ContentDto[],
);
</script>

<template>
    <div data-test="activity-liked">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
            <ActivityCard
                v-for="item in sorted"
                :key="item._id"
                :content="item"
                type="liked"
            />
        </div>
        <div
            v-if="!sorted.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.liked.empty_page") }}
        </div>
    </div>
</template>
