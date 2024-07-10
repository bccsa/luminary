<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { TagType } from "@/types";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { DocType, db } from "luminary-shared";

const { isAuthenticated } = useAuth0();

const hasPosts = db.someByTypeAsRef(DocType.Post);

const pinnedCategories = db.tagsWhereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        pinned: true,
    },
    languageId: "lang-eng",
});
const unpinnedCategories = db.tagsWhereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        pinned: false,
        limit: 10,
    },
    languageId: "lang-eng",
});
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
        <div class="space-y-4 pt-4">
            <!-- Display latest posts -->

            <HorizontalScrollableTagViewer
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
                    languageId: 'lang-eng',
                }"
            />

            <!-- Display pinned category -->
            <HorizontalScrollableTagViewer
                v-for="category in pinnedCategories"
                :key="category._id"
                :tag="category"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: 'lang-eng',
                }"
            />

            <!-- Display unpined category -->
            <HorizontalScrollableTagViewer
                v-for="category in unpinnedCategories"
                :key="category._id"
                :tag="category"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                    languageId: 'lang-eng',
                }"
            />
        </div>
    </IgnorePagePadding>
</template>
