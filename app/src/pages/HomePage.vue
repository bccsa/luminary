<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import HorizontalScrollableTagViewerCollection from "@/components/tags/HorizontalScrollableTagViewerCollection.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { DocType, TagType } from "luminary-shared";
import { luminary } from "@/main";
import { appLanguageIdAsRef } from "@/globalConfig";
import { ref } from "vue";

const { isAuthenticated } = useAuth0();

const hasPosts = luminary.db.someByTypeAsRef(DocType.Post);

const noContentMessageDelay = ref(false);
setTimeout(() => {
    noContentMessageDelay.value = true;
}, 1000);
</script>

<template>
    <div v-if="!hasPosts" class="text-zinc-800 dark:text-zinc-100">
        <div v-if="isAuthenticated">
            <p>
                You don't have access to any content. If you believe this is an error, send your
                contact person a message.
            </p>
        </div>
        <div v-else>
            <div v-if="noContentMessageDelay">
                <p>There is currently no content available.</p>

                <p class="mt-1">
                    Please
                    <router-link
                        :to="{ name: 'login' }"
                        class="text-yellow-600 underline hover:text-yellow-500"
                        >log in </router-link
                    >if you have an account.
                </p>
            </div>
        </div>
    </div>
    <IgnorePagePadding v-else>
        <div class="pt-4" v-if="appLanguageIdAsRef">
            <!-- Display latest posts -->
            <HorizontalScrollableTagViewer
                :key="appLanguageIdAsRef"
                title="Newest Content"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'desc',
                    },
                    filterOptions: {
                        limit: 10,
                        docType: DocType.Post,
                    },
                    languageId: appLanguageIdAsRef,
                }"
            />

            <!-- Display pinned categories -->
            <HorizontalScrollableTagViewerCollection
                :key="appLanguageIdAsRef"
                :showPublishDate="false"
                :tagType="TagType.Category"
                :tagQueryOptions="{
                    filterOptions: {
                        topLevelOnly: true,
                        pinned: true,
                    },
                    languageId: appLanguageIdAsRef,
                }"
                :contentQueryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: appLanguageIdAsRef,
                }"
            />

            <!-- Display unpined categories -->
            <HorizontalScrollableTagViewerCollection
                :key="appLanguageIdAsRef"
                :tagType="TagType.Category"
                :tagQueryOptions="{
                    filterOptions: {
                        topLevelOnly: true,
                        pinned: false,
                    },
                    languageId: appLanguageIdAsRef,
                }"
                :contentQueryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: appLanguageIdAsRef,
                }"
            />
        </div>
    </IgnorePagePadding>
</template>
