<script setup lang="ts">
import { watch, computed } from "vue";
import {
    type ContentDto,
    DocType,
    PostType,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
    mangoToDexie,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { mangoIsPublished } from "@/util/mangoIsPublished";

const newest100Content = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { video: { $exists: true, $ne: "" } },
                    { parentPostType: { $ne: PostType.Page } },
                    { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
            $sort: [{ publishDate: "desc" }],
            $limit: 100,
        });
    },
    {
        initialValue: await db.getQueryCache<ContentDto[]>("videopage_newest100Content"),
        deep: true,
    },
);

watch(newest100Content, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_newest100Content", value);
});

const categoryIds = computed(() =>
    newest100Content.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        }),
);

const categories = useDexieLiveQueryWithDeps(
    [categoryIds, appLanguageIdsAsRef],
    ([_categoryIds, appLanguageIds]: [Uuid[], Uuid[]]) => {
        if (_categoryIds.length === 0) return Promise.resolve([] as ContentDto[]);
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { parentId: { $in: _categoryIds } },
                    { parentType: DocType.Tag },
                    { parentTagType: TagType.Category },
                    { $or: [{ parentPinned: { $exists: false } }, { parentPinned: { $ne: 1 } }] },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
    },
    {
        initialValue: await db.getQueryCache<ContentDto[]>("videopage_unpinnedCategories"),
        deep: true,
    },
);

watch(
    () => categories.value,
    (value) => {
        db.setQueryCache<ContentDto[]>("videopage_unpinnedCategories", value);
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
