<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import LibraryActivityCard from "./LibraryActivityCard.vue";
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
    <div data-test="library-viewed">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <LibraryActivityCard
                v-for="item in sorted"
                :key="item._id"
                :content="item"
                type="viewed"
                removable
                @remove="removeUserActivity({ type: 'viewed', parentId: item.parentId })"
            />
        </div>
        <div
            v-if="!sorted.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("library.viewed.empty_page") }}
        </div>
    </div>
</template>
