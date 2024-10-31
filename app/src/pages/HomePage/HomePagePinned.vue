<script setup lang="ts">
import { ref, watch } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import HomePagePinnedContent from "./HomePagePinnedContent.vue";

const pinnedCategories = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    await db.getQueryCache<ContentDto[]>("homepage_pinnedCategories"),
);

const refreshKey = ref(0);
watch(pinnedCategories, async (value) => {
    const updated = await db.setQueryCache<ContentDto[]>("homepage_pinnedCategories", value);
    if (updated) refreshKey.value++;
});
</script>

<template>
    <HomePagePinnedContent
        :pinnedCategories="pinnedCategories"
        :key="refreshKey"
        v-if="pinnedCategories.length"
    />
</template>
