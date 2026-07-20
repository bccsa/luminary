<script setup lang="ts">
import { TagType, type ContentDto } from "luminary-shared";
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useMoreLikeThis } from "@/composables/useMoreLikeThis";
import { useI18n } from "vue-i18n";
import ReadMore from "./ReadMore.vue";

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

const { t } = useI18n();

// Topic pages already list their own content, so the "Read more" block is for non-topics.
const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);

// Ids of posts tagged with any of the current article's topic tags. `parentTaggedDocs`
// is optional and may contain null/undefined holes — drop them before they become
// `{ parentId: { $in: [null] } }`, which crashes CouchDB's _find. `new Set` dedupes.
const contentIds = computed(() => [
    ...new Set(props.tags.flatMap((tag) => tag.parentTaggedDocs ?? []).filter((id) => id != null)),
]);

const contentDocs = useContentQuery(() => [{ parentId: { $in: contentIds.value } }], {
    includeScheduled: false,
    sort: [{ publishDate: "desc" }],
    limit: 50,
});

// One flat, newest-first list (dedup is inherent — a single query, not one row per tag),
// with the current article removed. The query's `limit` is the overall cap; per-breakpoint
// display (mobile infinite scroll, desktop full scroll row) is ReadMore's job.
const relatedContent = computed(() =>
    contentDocs.value.filter((item) => item._id !== props.selectedContent._id),
);

// Topic pages and their related posts belong in one collection. Keep the related
// posts first and deduplicate by document id in case the inputs ever overlap.
const readMoreItems = computed(() =>
    [...relatedContent.value, ...props.tags].filter(
        (item, index, items) => items.findIndex(({ _id }) => _id === item._id) === index,
    ),
);

// Personalized "more like this" for the current article. Retrieval stays topical (seeded
// from this article's tags + title/summary FTS); rank()'s affinity scoring tilts the order
// toward the viewer's interests. Shown as its own row, separate from the Read more list.
const { similar } = useMoreLikeThis(
    () => props.selectedContent,
    () => props.tags,
);
</script>

<template>
    <section
        v-if="isNotTopic && readMoreItems.length"
        class="w-full pb-2"
    >
        <!-- Horizontal padding mirrors the list/grid inset in ReadMore so the heading
             lines up with the first card at every breakpoint. -->
        <h2 class="px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8">
            {{ t("content.read_more") }}
        </h2>
        <ReadMore :items="readMoreItems" />
    </section>

    <section
        v-if="similar.length"
        class="w-full pb-2"
    >
        <h2 class="px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200 sm:px-8">
            {{ t("content.similar_title") }}
        </h2>
        <ReadMore :items="similar" />
    </section>
</template>
