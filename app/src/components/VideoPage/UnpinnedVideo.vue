<script setup lang="ts">
import { computed } from "vue";
import { DocType, PostType, TagType } from "luminary-shared";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";

const newest100Content = useContentQuery(
    () => [
        // Only include content that has a video, is not page content, and is either untagged or tagged with a topic.
        { video: { $exists: true, $ne: "" } },
        { video: { $ne: null } },
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
    ],
    { sort: [{ publishDate: "desc" }], limit: 100, cache: true },
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
    { cache: true },
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
