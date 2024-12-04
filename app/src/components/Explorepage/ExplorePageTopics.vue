<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    db,
    DocType,
    TagType,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { watch, ref } from "vue";
// const topics = useDexieLiveQueryWithDeps(
//     appLanguageIdsAsRef,
//     async (languageIds: Uuid[]) => {
//         const limitedLanguageIds = languageIds.slice(0, 3);

//         const mergedContent: ContentDto[] = [];

//         await Promise.all(
//             languageIds.map(async (languageId) => {
//                 const contentList = await db.docs
//                     .where({
//                         type: DocType.Content,
//                         parentTagType: TagType.Topic,
//                         language: languageId,
//                         status: "published",
//                     })
//                     .filter((c) => {
//                         const content = c as ContentDto;
//                         if (!content.publishDate || content.publishDate > Date.now()) return false;
//                         if (content.expiryDate && content.expiryDate < Date.now()) return false;
//                         return true;
//                     })
//                     .toArray();

//                 contentList.forEach((c) => {
//                     const content = c as ContentDto;
//                     if (!mergedContent.some((item) => item.parentId === content.parentId)) {
//                         mergedContent.push(content);
//                     }
//                 });
//             }),
//         );
//         mergedContent.sort((a, b) => a.title.localeCompare(b.title));

//         return mergedContent;
//     },
//     {
//         initialValue: await db.getQueryCache<ContentDto[]>("explorepage_topics"),
//     },
// );
// const topics = useDexieLiveQueryWithDeps(
//     appLanguageIdsAsRef,
//     async (languageIds: Uuid[]) => {
//         // Limit to the first three languages
//         const limitedLanguageIds = languageIds.slice(0, 3);

//         // Fetch content for the first three languages
//         const allContent = await Promise.all(
//             limitedLanguageIds.map((languageId) =>
//                 db.docs
//                     .where({
//                         type: DocType.Content,
//                         parentTagType: TagType.Topic,
//                         language: languageId,
//                         status: "published",
//                     })
//                     .filter((c) => {
//                         const content = c as ContentDto;

//                         // Only include published content
//                         if (!content.publishDate) return false;
//                         if (content.publishDate > Date.now()) return false;
//                         if (content.expiryDate && content.expiryDate < Date.now()) return false;
//                         return true;
//                     })
//                     .toArray(),
//             ),
//         );

//         // Merge content based on shared identifier (e.g., sharedId)
//         const contentMap = new Map<string, ContentDto>();

//         for (const [index, contentList] of allContent.entries()) {
//             for (const c of contentList) {
//                 const content = c as ContentDto;
//                 const contentId = content.parentId; // Use sharedId if translations share an identifier
//                 if (!contentMap.has(contentId)) {
//                     // Prioritize content from earlier languages in the limited array
//                     contentMap.set(contentId, content);
//                 }
//             }
//         }

//         // Extract and sort the merged content
//         const mergedContent = Array.from(contentMap.values()).sort((a, b) =>
//             a.title.localeCompare(b.title),
//         );

//         return mergedContent;
//     },
//     {
//         initialValue: await db.getQueryCache<ContentDto[]>("explorepage_topics"),
//     },
// );
const topics = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    async (languageId: Uuid) => {
        // const allTopics = db.docs
        //     .where({
        //         type: DocType.Content,
        //         parentTagType: TagType.Topic,
        //         status: "published",
        //     })
        //     .filter((c) => {
        //         const content = c as ContentDto;

        //         // Only include published content
        //         if (!content.publishDate) return false;
        //         if (content.publishDate > Date.now()) return false;
        //         if (content.expiryDate && content.expiryDate < Date.now()) return false;
        //         return true;
        //     })
        //     .sortBy("title") as unknown as Promise<ContentDto[]>;

        const allTopicTagsPrimaryLang = await db.tagsWhereTagType(TagType.Topic, {
            languageId: appLanguageIdsAsRef.value[0],
        });
        const allTopicTagsSecondaryLang = await db.tagsWhereTagType(TagType.Topic, {
            languageId: appLanguageIdsAsRef.value[1],
        });
        const allTopicTagsTertiaryLang = await db.tagsWhereTagType(TagType.Topic, {
            languageId: appLanguageIdsAsRef.value[2],
        });

        const allTopicsToDisplay: ContentDto[] = async () => {
            const allTopics = [];
            for (let p = 0; p < allTopicTagsPrimaryLang.length; p++) {
                for (let s = 0; s < allTopicTagsSecondaryLang.length; s++) {
                    for (let t = 0; t < allTopicTagsTertiaryLang.length; t++) {
                        if (
                            allTopicTagsPrimaryLang[p].parentId ==
                                allTopicTagsSecondaryLang[s].parentId &&
                            allTopicTagsPrimaryLang[p].parentId ==
                                allTopicTagsTertiaryLang[t].parentId
                        ) {
                            const currentTopicContentPrimary: ContentDto[] = await db.whereParent(
                                [
                                    allTopicTagsPrimaryLang[p].parentId!,
                                    allTopicTagsSecondaryLang[s].parentId!,
                                    allTopicTagsTertiaryLang[t].parentId!,
                                ],
                                DocType.Tag,
                                appLanguageIdsAsRef.value[0],
                            );
                            const currentTopicContentSecondary: ContentDto[] = await db.whereParent(
                                [
                                    allTopicTagsPrimaryLang[p].parentId!,
                                    allTopicTagsSecondaryLang[s].parentId!,
                                    allTopicTagsTertiaryLang[t].parentId!,
                                ],
                                DocType.Tag,
                                appLanguageIdsAsRef.value[1],
                            );
                            const currentTopicContentTertiary: ContentDto[] = await db.whereParent(
                                [
                                    allTopicTagsPrimaryLang[p].parentId!,
                                    allTopicTagsSecondaryLang[s].parentId!,
                                    allTopicTagsTertiaryLang[t].parentId!,
                                ],
                                DocType.Tag,
                                appLanguageIdsAsRef.value[2],
                            );

                            if (currentTopicContentPrimary.length > 0) {
                                allTopics.push(currentTopicContentPrimary);
                            } else if (currentTopicContentSecondary.length > 0) {
                                allTopics.push(currentTopicContentSecondary);
                            } else if (currentTopicContentTertiary.length > 0) {
                                allTopics.push(currentTopicContentTertiary);
                            }
                        }
                    }
                }
            }
            console.info("All topics:", () => allTopics);
            return await allTopics;
        };
        console.info("All topics to display:", allTopicsToDisplay);
        return await allTopicsToDisplay;
    },
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_topics"),
    },
);

watch(topics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_topics", value);
});
</script>

<template>
    <div class="flex flex-wrap gap-4">
        <ContentTile
            v-for="topic in topics"
            :key="topic._id"
            :content="topic"
            :showPublishDate="false"
        />
    </div>
</template>
