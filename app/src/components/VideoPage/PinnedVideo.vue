<script setup lang="ts">
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    PostType,
    PublishStatus,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
// import { appLanguageIdAsRef } from "@/globalConfig";
// import { appLanguagePreferredIdAsRef, appLanguagesPreferredAsRef } from "@/globalConfig";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { isPublished } from "@/util/isPublished";
import IgnorePagePadding from "../IgnorePagePadding.vue";

const pinnedCategories = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                const content = c as ContentDto;
                return isPublished(content, appLanguageIdsAsRef.value);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedCategories") },
);

watch(pinnedCategories, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedCategories", value);
});

const pinnedCategoryContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedCategories],
    ([appLanguageId, pinnedCategories]: [Uuid, ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: PublishStatus.Published,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!isPublished(content, appLanguageIdsAsRef.value)) return false;

                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                if (!content.video) return false;

                for (const tagId of content.parentTags) {
                    if (pinnedCategories.some((p) => p.parentId == tagId)) return true;
                }

                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_pinnedContent") },
);

watch(pinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByTag(pinnedCategoryContent, pinnedCategories);
</script>

<template>
    <IgnorePagePadding>
        <HorizontalContentTileCollection
            v-for="c in pinnedContentByCategory"
            :key="c.tag._id"
            :contentDocs="c.content"
            :title="c.tag.title"
            :summary="c.tag.summary"
            :showPublishDate="false"
            class="bg-yellow-500/10 pb-1 pt-2 dark:bg-yellow-500/5"
        />
    </IgnorePagePadding>
</template>
