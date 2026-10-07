<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import ContentTile from "@/components/content/ContentTile.vue";
import { TrashIcon } from "@heroicons/vue/24/outline";
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
        <div class="flex flex-wrap gap-4">
            <div
                v-for="item in sorted"
                :key="item._id"
                class="group relative"
            >
                <ContentTile
                    :content="item"
                    class="flex w-auto justify-start"
                />
                <!-- Always reachable on a phone, which has no hover to reveal it. -->
                <button
                    type="button"
                    class="absolute bottom-2 right-2 rounded-full bg-zinc-900/60 p-2.5 text-white transition hover:bg-red-600 focus:bg-red-600 focus:opacity-100 active:bg-red-700 sm:opacity-0 sm:group-hover:opacity-100"
                    :aria-label="t('library.remove.label')"
                    data-test="library-remove-viewed"
                    @click.stop.prevent="
                        removeUserActivity({ type: 'viewed', parentId: item.parentId })
                    "
                >
                    <TrashIcon class="h-5 w-5" />
                </button>
            </div>
        </div>
        <div
            v-if="!sorted.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("library.viewed.empty_page") }}
        </div>
    </div>
</template>
