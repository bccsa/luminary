<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { toRef, watch } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { contentByCategory } from "./contentByCategory";

type Props = {
    pinnedCategories: ContentDto[];
};
const props: Props = defineProps<Props>();

const pinnedCategoryContent = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;

                for (const tagId of content.parentTags) {
                    if (props.pinnedCategories.some((p) => p.parentId == tagId)) return true;
                }
                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    await db.getQueryCache<ContentDto[]>("homepage_pinnedContent"),
);
watch(pinnedCategoryContent, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_pinnedContent", value);
});

// sort pinned content by category
const pinnedContentByCategory = contentByCategory(
    pinnedCategoryContent,
    toRef(() => props.pinnedCategories),
);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="c in pinnedContentByCategory"
        :key="c.category._id"
        :contentDocs="c.content"
        :title="c.category.title"
        :summary="c.category.summary"
        :showPublishDate="false"
        class="bg-yellow-500/10 pb-3 pt-4 dark:bg-yellow-500/5"
    />
</template>
