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
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <div
                v-for="item in sorted"
                :key="item._id"
                class="group relative [&_[data-card-text]]:pr-10"
            >
                <ContentTile
                    :content="item"
                    layout="card"
                    class="h-full w-full"
                />
                <!-- Bottom-right of the card. Always visible on touch devices, which have no hover to
                     reveal it; on hover-capable devices it fades in when the card is hovered. -->
                <button
                    type="button"
                    class="absolute bottom-2 right-2 rounded-full p-1.5 text-zinc-500 transition hover:text-red-600 focus:text-red-600 focus:opacity-100 active:text-red-700 dark:text-slate-400 dark:hover:text-red-400 dark:focus:text-red-400 dark:active:text-red-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    :aria-label="t('library.remove.label')"
                    data-test="library-remove-viewed"
                    @click.stop.prevent="
                        removeUserActivity({ type: 'viewed', parentId: item.parentId })
                    "
                >
                    <TrashIcon class="h-4 w-4" />
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
