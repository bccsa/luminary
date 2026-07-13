<script setup lang="ts">
import { DocType, TagType, type ContentDto } from "luminary-shared";
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";
import ReadMore from "./ReadMore.vue";

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

const { t } = useI18n();

const MAX_ITEMS = 8;

// Topic pages already list their own content, so the "Read more" block is for non-topics.
const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);

// Ids of posts tagged with any of the current article's topic tags. `parentTaggedDocs`
// is optional and may contain null/undefined holes — drop them before they become
// `{ parentId: { $in: [null] } }`, which crashes CouchDB's _find. `new Set` dedupes.
const contentIds = computed(() => [
    ...new Set(props.tags.flatMap((tag) => tag.parentTaggedDocs ?? []).filter((id) => id != null)),
]);

const contentDocs = useContentQuery(() => [{ parentId: { $in: contentIds.value } }], {
    sort: [{ publishDate: "desc" }],
    limit: 50,
});

// One flat, newest-first list (dedup is inherent — a single query, not one row per tag),
// with the current article removed and capped.
const relatedContent = computed(() =>
    contentDocs.value.filter((item) => item._id !== props.selectedContent._id).slice(0, MAX_ITEMS),
);

// Resolve each related post's tag ids to titles for the per-card chips: one query over
// every tag any of the related posts carries.
const relatedTagIds = computed(() => [
    ...new Set(relatedContent.value.flatMap((c) => c.parentTags ?? []).filter((id) => id != null)),
]);

const tagDocs = useContentQuery(
    () =>
        relatedTagIds.value.length
            ? [{ parentId: { $in: relatedTagIds.value } }, { parentType: DocType.Tag }]
            : [{ parentId: { $in: [] } }],
    { includeScheduled: false },
);

// Tag id -> title, restricted to the category/topic tags shown elsewhere on the article.
const tagTitleById = computed(() => {
    const map = new Map<string, string>();
    for (const tag of tagDocs.value) {
        if (tag.parentTagType === TagType.Category || tag.parentTagType === TagType.Topic) {
            map.set(tag.parentId, tag.title);
        }
    }
    return map;
});

const items = computed(() =>
    relatedContent.value.map((content) => ({
        content,
        tags: (content.parentTags ?? [])
            .map((id) => tagTitleById.value.get(id))
            .filter((title): title is string => !!title),
    })),
);
</script>

<template>
    <section
        v-if="isNotTopic && items.length"
        class="px-4 pb-2"
    >
        <h2 class="pb-3 text-xl text-zinc-800 dark:text-zinc-200">
            {{ t("content.read_more") }}
        </h2>
        <ReadMore :items="items" />
    </section>
</template>
