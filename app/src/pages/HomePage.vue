<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { TagType } from "@/types";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { DocType, db, type PostDto, type TagDto, type Uuid } from "luminary-shared";

const { isAuthenticated } = useAuth0();

type Props = {
    parent: PostDto | TagDto;
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
    language?: Uuid;
};
defineProps<Props>();

const hasPosts = db.someByTypeAsRef(DocType.Post);

const pinnedCategories = db.whereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        excludeEmpty: true,
        pinned: true,
    },
    sortOptions: {
        sortBy: "publishDate",
        sortOrder: "asc",
    },
});
const unpinnedCategories = db.whereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        excludeEmpty: true,
        pinned: false,
    },
    sortOptions: {
        sortBy: "publishDate",
        sortOrder: "asc",
    },
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

            <!-- <HorizontalScrollableTagViewer
                title="Newest Content"
                :queryOptions="{
                    sortOptions: {  
                        sortBy: 'publishDate',
                        sortOrder: 'desc',
                    },
                    filterOptions: {
                        top: 10,
                        excludeEmpty: true,
                    },
                }"
            /> -->

            <!-- Display pinned category -->
            <HorizontalScrollableTagViewer
                v-for="post in pinnedCategories"
                :key="post._id"
                :tag="post"
                languageId="lang-eng"
                title="Newest Content"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'desc',
                    },
                    filterOptions: {
                        top: 10,
                    },
                }"
            />

            <!-- Display unpined category -->
            <HorizontalScrollableTagViewer
                v-for="tag in unpinnedCategories"
                :key="tag._id"
                :tag="tag"
                languageId="lang-eng"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                }"
            />
        </div>
    </IgnorePagePadding>
</template>
