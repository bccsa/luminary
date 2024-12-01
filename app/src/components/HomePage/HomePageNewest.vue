<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { ref, watch } from "vue";
import { type ContentDto, DocType, PostType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
// const newest10Content = useDexieLiveQueryWithDeps(
//     appLanguageIdsAsRef,
//     async (appLanguageId: Uuid) => {
//         const allTranslationsForParent = await db.docs.filter((c) => {
//             const content = c as ContentDto;
//             const allTranslations = db.whereParentAsRef(
//                 content.parentId,
//                 undefined,
//                 content.language,
//             );
//             console.info(allTranslations.value);
//             return allTranslations.value.some(
//                 (translation) => translation.parentId === content.parentId,
//             );
//         });
//         console.info(allTranslationsForParent.toArray());
//         const query = db.docs
//             .orderBy("publishDate")
//             .reverse()
//             .filter((c) => {
//                 const content = c as ContentDto;

//                 if (content.type !== DocType.Content) return false;
//                 if (content.language !== appLanguageId[0]) return false;
//                 if (content.parentPostType && content.parentPostType == PostType.Page) return false;

//                 // Only include published content
//                 if (content.status !== "published") return false;
//                 if (!content.publishDate) return false;
//                 if (content.publishDate > Date.now()) return false;
//                 if (content.expiryDate && content.expiryDate < Date.now()) return false;
//                 return true;
//             })
//             .limit(10) // Limit to the newest posts
//             .toArray() as unknown as Promise<ContentDto[]>;
//         return query;
//     },
//     { initialValue: await db.getQueryCache<ContentDto[]>("homepage_newestContent") },
// );

// const userPrimaryLanguageContent = await db.docs
//     .where("language")
//     .equals(appLanguageIdsAsRef.value[0])
//     .toArray();
// console.info("Primary Language:", userPrimaryLanguageContent);
// const userSecondaryLanguageContent = await db.docs
//     .where("language")
//     .equals(appLanguageIdsAsRef.value[1])
//     .toArray();

const userPreferredLanguages = ref<ContentDto[]>([]); // Reactive storage for fetched docs

// watchEffect(async () => {
//     const docs: ContentDto[] = [];
//     for (const language of appLanguageIdsAsRef.value) {
//         const contentForLanguage = (await db.docs
//             .where("language")
//             .equals(language)
//             .toArray()) as ContentDto[];
//         docs.push(...contentForLanguage); // Collect all results
//     }
//     userPreferredLanguages.value = docs; // Update reactive storage
// });

// watch(
//     () => userPreferredLanguages.value,
//     (newVal) => {
//         console.log("Updated userPreferredLanguages:", newVal);
//     },
//     { immediate: true },
// );

// console.info("Secondary Language:", userSecondaryLanguageContent);
// watch(appLanguageIdsAsRef, async () => {
//     const userPrimaryLanguageContent = await db.docs
//         .where("language")
//         .equals(appLanguageIdsAsRef.value[0])
//         .toArray();
//     console.info("Primary Language:", userPrimaryLanguageContent);
//     const userSecondaryLanguageContent = await db.docs
//         .where("language")
//         .equals(appLanguageIdsAsRef.value[1])
//         .toArray();
//     console.info("Secondary Language:", userSecondaryLanguageContent);
// });

const newest10Content = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;

                if (content.type !== DocType.Content) return false;
                if (content.language !== appLanguageIds[0]) return false;
                if (content.parentPostType && content.parentPostType == PostType.Page) return false;

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .limit(10) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("homepage_newestContent"),
    },
);

watch(newest10Content, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newestContent", value);
});
</script>

<template>
    {{ userPreferredLanguages }}
    <HorizontalContentTileCollection
        :contentDocs="newest10Content"
        title="Newest"
        :showPublishDate="true"
    />
</template>
