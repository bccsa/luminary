<script setup lang="ts">
/**
 * The videos on offer after the one playing, laid out as the article's related content is: an
 * image-left row with the title, the summary and the categories. A tap plays it here instead of
 * opening its page.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { PlayIcon } from "@heroicons/vue/24/solid";
import type { ContentDto } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import LImage from "@/components/images/LImage.vue";

const props = defineProps<{ next: ContentDto[]; related: ContentDto[] }>();
const { t } = useI18n();

const sections = computed(() =>
    [
        { id: "next", label: t("media_player.next_in_series"), items: props.next },
        { id: "related", label: t("media_player.related"), items: props.related },
    ].filter((section) => section.items.length),
);
const items = computed(() => [...props.next, ...props.related]);
defineEmits<{ select: [content: ContentDto] }>();

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const tagIds = computed(() => [...new Set(items.value.flatMap((item) => item.parentTags ?? []))]);
const tagDocs = useContentQuery(
    () => [{ parentId: { $in: tagIds.value.length ? tagIds.value : [] } }],
    { includeScheduled: false, useIndex: "content-parentId-publishDate-index" },
);
const tagsFor = (content: ContentDto): ContentDto[] => {
    const ids = new Set(content.parentTags ?? []);
    return tagDocs.value.filter((tag) => ids.has(tag.parentId));
};
</script>

<template>
    <div class="flex-1 overflow-y-auto pb-8">
        <section
            v-for="section in sections"
            :key="section.id"
            :data-test="`mediaPlayerUpNext-${section.id}`"
        >
            <h3
                class="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400"
            >
                {{ section.label }}
            </h3>
            <ul class="flex flex-col gap-3 px-4">
                <li
                    v-for="item in section.items"
                    :key="item._id"
                >
                    <button
                        type="button"
                        class="group flex w-full gap-2 overflow-hidden rounded-lg bg-white text-left shadow ring-1 ring-zinc-950/10 transition hover:shadow-lg dark:bg-slate-800 dark:ring-white/10"
                        data-test="mediaPlayerUpNextItem"
                        @click="$emit('select', item)"
                    >
                        <!-- The thumbnail fills the card's height, as the related cards' does. -->
                        <div
                            class="relative shrink-0 overflow-hidden [&>div>div]:!h-full [&>div]:h-full [&_img]:!h-full"
                        >
                            <LImage
                                :image="item.parentImageData"
                                :content-parent-id="item.parentId"
                                :parent-image-bucket-id="item.parentImageBucketId"
                                aspectRatio="classic"
                                size="thumbnailCompact"
                                :rounded="false"
                            />
                            <div class="absolute inset-0 flex items-center justify-center">
                                <PlayIcon class="h-7 w-7 text-black blur-sm" />
                                <PlayIcon class="absolute h-7 w-7 text-white" />
                            </div>
                        </div>

                        <div class="flex min-w-0 flex-1 flex-col gap-1 p-2 pl-0">
                            <h3
                                class="-mt-1 line-clamp-2 font-semibold text-zinc-800 dark:text-slate-50"
                            >
                                {{ item.title }}
                            </h3>
                            <p
                                v-if="summaryText(item)"
                                class="line-clamp-2 text-sm text-zinc-500 dark:text-slate-400"
                            >
                                {{ summaryText(item) }}
                            </p>
                            <div
                                v-if="tagsFor(item).length"
                                class="-ml-2 mt-auto flex gap-1 overflow-x-auto pl-2 scrollbar-hide"
                                data-test="content-tags"
                            >
                                <span
                                    v-for="tag in tagsFor(item)"
                                    :key="tag._id"
                                    class="shrink-0 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
                                >
                                    {{ tag.title }}
                                </span>
                            </div>
                        </div>
                    </button>
                </li>
            </ul>
        </section>
    </div>
</template>
