<script setup lang="ts">
import { db, useDexieLiveQueryWithDeps, type ContentDto, type Uuid } from "luminary-shared";
import { toRef } from "vue";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import { isPublished } from "@/util/isPublished";

const router = useRouter();
type Props = {
    tag: ContentDto;
};
const props = defineProps<Props>();

const isContentSelected = (slug: string) => {
    if (router.currentRoute.value.params.slug === slug) return true;
    return false;
};

const tagged = useDexieLiveQueryWithDeps(
    [appLanguageIdAsRef, toRef(() => props.tag.parentTaggedDocs)],
    ([languageId, ids]: [Uuid, Uuid]) =>
        db.docs
            .where("parentId")
            .anyOf(ids)
            .filter((c) => {
                const content = c as ContentDto;
                if (content.language != languageId) return false;
                return isPublished(content);
            })
            .sortBy("publishDate") as unknown as Promise<ContentDto[]>,
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
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>
