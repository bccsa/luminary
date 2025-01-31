<script setup lang="ts">
import { ref, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { RouterLink } from "vue-router";
import { ChevronDownIcon } from "@heroicons/vue/24/solid";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const allTopics = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
                parentTagType: TagType.Topic,
            })
            .filter((c) => {
                const content = c as ContentDto;
                return !!(
                    isPublished(content, appLanguageIds) &&
                    content.parentTaggedDocs &&
                    content.parentTaggedDocs.length > 0
                );
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_allTopics"),
        deep: true,
    },
);

const tagContent = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
                parentTagType: TagType.Category,
            })
            .filter((c) => {
                return isPublished(c as ContentDto, appLanguageIds);
            })

            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_tagContent"),
        deep: true,
    },
);

watch(allTopics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_allTopics", value);
});

watch(tagContent, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_tagContent", value);
});

// Track the collapsed state for each tag
const collapsedTags = ref<Record<string, boolean>>({});

// Toggle function for collapse state
const toggleTag = (tagId: string) => {
    collapsedTags.value[tagId] = !collapsedTags.value[tagId];
};
</script>

<template>
    <div v-if="allTopics" class="lg:mx-32">
        <div class="mb-4 mt-6">
            <div class="relative">
                <MagnifyingGlassIcon
                    class="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
                />
                <input
                    v-model="searchTerm"
                    name="input"
                    type="text"
                    :placeholder="t('topic.search_placeholder') + '...'"
                    class="w-full rounded-md border border-zinc-500 bg-inherit py-1 pl-8 pr-2"
                />
            </div>
        </div>

        <!-- Show "No results found" message if filteredTopics is empty and searchTerm is not blank -->
        <div
            v-if="filteredTopics.length === 0 && searchTerm.trim()"
            class="text-center text-gray-500"
        >
            {{ t("topic.no_results_found") }} "{{ searchTerm }}"
        </div>

        <div class="space-y-2">
            <div
                v-for="content in filteredTopics"
                :key="content._id"
                class="flex overflow-clip rounded-lg bg-zinc-50 pl-2 shadow-sm hover:bg-yellow-500/10 dark:bg-slate-800 dark:hover:bg-yellow-500/10 md:pl-4"
            >
                <RouterLink
                    :to="{ name: 'content', params: { slug: content.slug } }"
                    class="flex w-full justify-between"
                >
                    <div class="my-auto flex flex-col gap-y-1 text-zinc-800 dark:text-slate-50">
                        <h3 class="text-sm">{{ content.title }}</h3>
                        <p
                            v-if="content.summary"
                            class="line-clamp-1 text-xs text-zinc-500 dark:text-slate-300"
                        >
                            {{ content.summary }}
                        </p>
                    </div>
                    <LImage
                        :image="content.parentImageData"
                        aspectRatio="classic"
                        size="small"
                        class="flex items-center"
                        :rounded="false"
                    />
                </RouterLink>
    <div v-if="allTopics" class="mt-8 lg:mx-32">
        <div
            v-for="tag in tagContent.slice().sort((a, b) => a.title.localeCompare(b.title))"
            :key="tag._id"
            class="left-0 top-0 flex w-full flex-col items-center overflow-hidden bg-white dark:bg-slate-900"
            style="z-index: 1; position: sticky"
        >
            <div
                v-if="allTopics.some((topic) => topic.parentTags.includes(tag.parentId))"
                class="mb-6 h-full w-full"
            >
                <div
                    class="flex h-full cursor-pointer items-center gap-x-3 border-b border-white bg-white py-2 dark:border-slate-700 dark:bg-slate-900 md:min-h-16"
                    @click="toggleTag(tag._id)"
                >
                    <div
                        class="transform transition-transform"
                        :class="{ 'rotate-180': collapsedTags[tag._id] }"
                    >
                        <ChevronDownIcon class="h-6 w-6" />
                    </div>
                    <span class="font-cormorant-garamond text-xl">{{ tag.title }}</span>
                </div>

                <div v-show="!collapsedTags[tag._id]" class="space-y-1.5">
                    <div
                        v-for="content in allTopics.filter((c) =>
                            c.parentTags.includes(tag.parentId),
                        )"
                        :key="content._id"
                        class="flex overflow-clip bg-zinc-50 pl-2 shadow-sm hover:bg-yellow-500/10 dark:bg-slate-800 dark:hover:bg-yellow-500/10 md:pl-4"
                    >
                        <RouterLink
                            :to="{ name: 'content', params: { slug: content.slug } }"
                            class="flex w-full justify-between"
                        >
                            <div
                                class="my-auto flex flex-col gap-y-1 text-zinc-800 dark:text-slate-50"
                            >
                                <h3 class="text-sm">{{ content.title }}</h3>
                                <p
                                    v-if="content.summary"
                                    class="line-clamp-1 text-xs text-zinc-500 dark:text-slate-300"
                                >
                                    {{ content.summary }}
                                </p>
                            </div>
                            <LImage
                                :image="content.parentImageData"
                                aspectRatio="classic"
                                size="small"
                                class="flex items-center"
                                :rounded="false"
                            />
                        </RouterLink>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
