<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import ContentTile from "@/components/content/ContentTile.vue";
import { TrashIcon } from "@heroicons/vue/24/outline";
import { HeartIcon } from "@heroicons/vue/24/solid";
import { removeUserActivity } from "@/userActivity/store";
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
    <div data-test="library-liked">
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
                <!-- Marks the card as liked content. Decorative, so it never intercepts the tile's click. -->
                <HeartIcon
                    class="pointer-events-none absolute right-2 top-2 h-5 w-5 text-yellow-400 drop-shadow"
                    aria-hidden="true"
                    data-test="library-liked-icon"
                />
                <!-- Bottom-right of the card. Always visible on touch devices, which have no hover to
                     reveal it; on hover-capable devices it fades in when the card is hovered. -->
                <button
                    type="button"
                    class="absolute bottom-2 right-1 rounded-full p-1.5 text-zinc-500 transition hover:text-red-600 focus:text-red-600 focus:opacity-100 active:text-red-700 dark:text-slate-400 dark:hover:text-red-400 dark:focus:text-red-400 dark:active:text-red-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    :aria-label="t('library.remove.label')"
                    data-test="library-remove-liked"
                    @click.stop.prevent="
                        removeUserActivity({ type: 'liked', parentId: item.parentId })
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
            {{ t("library.liked.empty_page") }}
        </div>
    </div>
</template>
