<script setup lang="ts">
import { db, mangoToDexie, useDexieLiveQueryWithDeps, type ContentDto, type Uuid } from "luminary-shared";
import { computed } from "vue";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { DateTime } from "luxon";

const router = useRouter();
type Props = {
    tag: ContentDto;
    showPublishDate?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const isContentSelected = (slug: string) => {
    if (router.currentRoute.value.params.slug === slug) return true;
    return false;
};

const parentTaggedDocsRef = computed(() => props.tag.parentTaggedDocs || []);

const tagged = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, parentTaggedDocsRef],
    ([languageIds, ids]: [Uuid[], Uuid[]]) => {
        if (!ids || ids.length === 0) return Promise.resolve([] as ContentDto[]);
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [{ parentId: { $in: ids } }, ...mangoIsPublished(languageIds)],
            },
            $sort: [{ publishDate: "asc" }],
        });
    },
    { initialValue: [] as ContentDto[] },
);
</script>

<template>
    <div>
        <div>
            <RouterLink
                v-for="content in tagged"
                :key="content._id"
                :to="{
                    name: 'content',
                    params: { slug: content.slug },
                }"
            >
                <div
                    class="flex items-center space-x-4 border-l-4 border-transparent px-1 py-1 transition duration-200 hover:border-transparent hover:bg-yellow-100 dark:hover:bg-yellow-100/25"
                    :class="{
                        ' border-l-4 border-yellow-500 bg-yellow-100/50  dark:border-yellow-800 dark:bg-yellow-100/10':
                            isContentSelected(content.slug),
                    }"
                >
                    <div class="flex items-center">
                        <div class="relative overflow-hidden rounded">
                            <LImage
                                v-if="content.parentId"
                                :contentParentId="content.parentId"
                                :parent-image-bucket-id="content.parentImageBucketId"
                                :image="content.parentImageData"
                                aspectRatio="video"
                                size="small"
                            />
                        </div>
                    </div>
                    <div class="ml-2 w-2/3">
                        <h1 class="line-clamp-2 text-sm">
                            {{ content.title }}
                        </h1>
                        <!-- publish date -->
                        <div class="text-xs text-gray-500" v-if="showPublishDate">
                            <!-- {{ new Date(content.publishDate).toLocaleDateString() }} -->
                            {{
                                content.publishDate
                                    ? db
                                          .toDateTime(content.publishDate)
                                          .toLocaleString(DateTime.DATETIME_MED)
                                    : ""
                            }}
                        </div>
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>
