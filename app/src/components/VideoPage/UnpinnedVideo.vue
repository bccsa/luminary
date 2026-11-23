<script setup lang="ts">
import { computed } from "vue";
import { DocType, PostType, TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { hasVideoSelector } from "@/util/mediaSource";

type Props = {
    /** Shows only these parents, under cache entries of their own, leaving the full feed's alone. */
    parentIds?: readonly string[];
};
const props = defineProps<Props>();
// Fixed for the life of the list: a query takes its cache entry when it is made, so the page
// remounts the list to change it.
const filtered = props.parentIds !== undefined;

const newest100Content = useContentQuery(
    () => [
        // Only include content that has a video, is not page content, and is either untagged or tagged with a topic.
        hasVideoSelector,
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
        ...(filtered ? [{ parentId: { $in: [...(props.parentIds ?? [])] } }] : []),
    ],
    {
        sort: [{ publishDate: "desc" }],
        limit: 100,
        cache: true,
        ...(filtered ? { cacheId: "watch-unpinned-downloaded" } : {}),
    },
);

const categoryIds = computed(() =>
    newest100Content.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        }),
);

const categories = useContentQuery(
    () => [
        { parentId: { $in: categoryIds.value } },
        { parentType: DocType.Tag },
        { parentTagType: TagType.Category },
        { $or: [{ parentPinned: { $exists: false } }, { parentPinned: { $ne: 1 } }] },
    ],
    // The category set grows with the content query above it — keep the rows already
    // rendered rather than blanking them on each widening.
    {
        cache: true,
        keepPreviousResult: true,
        ...(filtered ? { cacheId: "watch-unpinned-categories-downloaded" } : {}),
    },
);

const unpinnedNewestContentByCategory = contentByTag(newest100Content, categories);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="(c, index) in unpinnedNewestContentByCategory.tagged.value"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        :summary="c.tag.summary"
        class="pb-1"
        :class="index == 0 ? 'pt-4' : 'pt-2'"
    />
</template>
