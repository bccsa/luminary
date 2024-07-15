<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import HorizontalScrollableTagViewerCollection from "@/components/tags/HorizontalScrollableTagViewerCollection.vue";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { DocType, TagType, db } from "luminary-shared";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { storeToRefs } from "pinia";

const { isAuthenticated } = useAuth0();
const { appLanguage } = storeToRefs(useGlobalConfigStore());

const hasPosts = db.someByTypeAsRef(DocType.Post);
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
            <p>There is currently no content available.</p>

            <p class="mt-1">
                If you have an account, first
                <router-link
                    :to="{ name: 'login' }"
                    class="text-yellow-600 underline hover:text-yellow-500"
                >
                    log in.
                </router-link>
            </p>
        </div>
    </div>
    <IgnorePagePadding v-else>
        <div class="pt-4" v-if="appLanguage">
            <!-- Display latest posts -->

            <HorizontalScrollableTagViewer
                :key="appLanguage._id"
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
                    languageId: appLanguage._id,
                }"
            />

            <!-- Display pinned categories -->
            <HorizontalScrollableTagViewerCollection
                :key="appLanguage._id"
                :tagType="TagType.Category"
                :tagQueryOptions="{
                    filterOptions: {
                        topLevelOnly: true,
                        pinned: true,
                    },
                    languageId: appLanguage._id,
                }"
                :contentQueryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: appLanguage._id,
                }"
            />

            <!-- Display unpined categories -->
            <HorizontalScrollableTagViewerCollection
                :key="appLanguage._id"
                :tagType="TagType.Category"
                :tagQueryOptions="{
                    filterOptions: {
                        topLevelOnly: true,
                        pinned: false,
                    },
                    languageId: appLanguage._id,
                }"
                :contentQueryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: appLanguage._id,
                }"
            />
        </div>
    </IgnorePagePadding>
</template>
