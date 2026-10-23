<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto, type UserActivityEntry } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivitySection from "./ActivitySection.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";

const { t } = useI18n();

const viewed = useUserActivity("viewed");
const parentIds = computed(() => viewed.value.map((row) => row.parentId));

const content = useContentQuery(() => [{ parentId: { $in: parentIds.value } }], {
    includeScheduled: false,
    keepPreviousResult: true,
});

type Entry = { row: UserActivityEntry; content: ContentDto };

/** Newest first, as the table returns them; an activity whose content is unavailable is left out. */
const entries = computed<Entry[]>(() =>
    viewed.value.flatMap((row) => {
        const item = content.value.find((c) => c.parentId === row.parentId);
        return item ? [{ row, content: item }] : [];
    }),
);

const sections = computed(() => groupByActivityDate(entries.value, (e) => e.row.updatedTimeUtc));
</script>

<template>
    <div data-test="activity-viewed">
        <ActivitySection
            v-for="section in sections"
            :key="section.group"
            :group="section.group"
        >
            <div class="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
                <ActivityCard
                    v-for="entry in section.items"
                    :key="entry.content._id"
                    :content="entry.content"
                    type="viewed"
                />
            </div>
        </ActivitySection>
        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.viewed.empty_page") }}
        </div>
    </div>
</template>
