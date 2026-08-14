<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import {
    DocType,
    PostType,
    TagType,
    PublishStatus,
    hasAnyPermission,
    AclPermission,
    type ContentDto,
    type PostDto,
    type TagDto,
    type GroupDto,
} from "luminary-shared";
import { cmsLanguages } from "@/globalConfig";
import {
    DocumentDuplicateIcon,
    TagIcon,
    CheckCircleIcon,
    CalendarDaysIcon,
    RectangleStackIcon,
} from "@heroicons/vue/20/solid";

const props = defineProps<{
    posts: PostDto[];
    tags: TagDto[];
    groups: GroupDto[];
    contentDocs: ContentDto[];
    scheduledContent: ContentDto[];
    expiredContent: ContentDto[];
}>();

const publishedCount = computed(
    () => props.contentDocs.filter((d) => d.status === PublishStatus.Published).length,
);
const draftCount = computed(
    () => props.contentDocs.filter((d) => d.status === PublishStatus.Draft).length,
);

const contentByParentType = computed(() => {
    let post = 0;
    let tag = 0;
    for (const d of props.contentDocs) {
        if (d.parentType === DocType.Post) post++;
        else if (d.parentType === DocType.Tag) tag++;
    }
    return { post, tag };
});

const canViewPosts = hasAnyPermission(DocType.Post, AclPermission.CmsView);
const canViewTags = hasAnyPermission(DocType.Tag, AclPermission.CmsView);
const canViewGroups = hasAnyPermission(DocType.Group, AclPermission.CmsView);
</script>

<template>
    <div class="grid grid-cols-2 gap-2 lg:flex">
        <RouterLink
            v-if="canViewPosts"
            :to="{
                name: 'overview',
                params: { docType: DocType.Post, tagOrPostType: PostType.Blog },
            }"
            class="rounded-lg-bg-white hover: group rounded-lg border border-t-4 border-transparent border-zinc-300 p-5 px-3 py-2 shadow-sm transition-colors duration-200 hover:border-blue-400 lg:flex-1 dark:bg-slate-700"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <DocumentDuplicateIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Posts</span>
            </div>
            <p
                class="mt-0.5 text-xl font-semibold leading-tight text-zinc-800 hover:text-blue-400 dark:text-yellow-400"
            >
                {{ posts.length }}
            </p>
            <p class="text-xs text-zinc-400">
                {{ contentByParentType.post }} content item{{
                    contentByParentType.post !== 1 ? "s" : ""
                }}
            </p>
        </RouterLink>

        <RouterLink
            v-if="canViewTags"
            :to="{
                name: 'overview',
                params: { docType: DocType.Tag, tagOrPostType: TagType.Category },
            }"
            class="rounded-lg-bg-white hover: group rounded-lg border border-t-4 border-transparent border-zinc-300 p-5 px-3 py-2 shadow-sm transition-colors duration-200 hover:border-yellow-400 lg:flex-1 dark:bg-slate-700"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <TagIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Tags</span>
            </div>
            <p
                class="mt-0.5 text-xl font-semibold leading-tight text-zinc-800 hover:text-yellow-400 dark:text-yellow-400"
            >
                {{ tags.length }}
            </p>
            <p class="text-xs text-zinc-400">
                {{ contentByParentType.tag }} content item{{
                    contentByParentType.tag !== 1 ? "s" : ""
                }}
            </p>
        </RouterLink>

        <div
            class="rounded-lg-bg-white hover: group rounded-lg border border-t-4 border-transparent border-zinc-300 p-5 px-3 py-2 shadow-sm transition-colors duration-200 hover:border-green-600 lg:flex-1 dark:bg-slate-700"
        >
            <div class="flex items-center gap-2 dark:text-zinc-100">
                <CheckCircleIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Published</span>
            </div>
            <p
                class="mt-0.5 text-xl font-semibold leading-tight text-zinc-800 hover:text-green-600 dark:text-yellow-400"
            >
                {{ publishedCount }}
            </p>
            <p v-if="draftCount > 0" class="text-xs text-zinc-400">
                {{ draftCount }} draft{{ draftCount !== 1 ? "s" : "" }}
            </p>
        </div>

        <div
            class="rounded-lg-bg-white hover: group rounded-lg border border-t-4 border-transparent border-zinc-300 p-5 px-3 py-2 shadow-sm transition-colors duration-200 hover:border-gray-400 lg:flex-1 dark:bg-slate-700"
        >
            <div class="flex items-center gap-2 dark:text-zinc-100">
                <CalendarDaysIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Scheduled</span>
            </div>
            <p
                class="mt-0.5 text-xl font-semibold leading-tight text-zinc-800 hover:text-gray-400 dark:text-yellow-400"
            >
                {{ scheduledContent.length }}
            </p>
            <p v-if="expiredContent.length > 0" class="text-xs text-amber-500">
                {{ expiredContent.length }} expired
            </p>
        </div>

        <RouterLink
            v-if="canViewGroups"
            :to="{ name: 'groups' }"
            class="rounded-lg-bg-white hover: group rounded-lg border border-t-4 border-transparent border-zinc-300 p-5 px-3 py-2 shadow-sm transition-colors duration-200 hover:border-purple-400 lg:flex-1 dark:bg-slate-700"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <RectangleStackIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Groups</span>
            </div>
            <p
                class="mt-0.5 text-xl font-semibold leading-tight text-zinc-800 hover:text-purple-400 dark:text-yellow-400"
            >
                {{ groups.length }}
            </p>
            <p class="text-xs text-zinc-400">
                {{ cmsLanguages.length }} language{{ cmsLanguages.length !== 1 ? "s" : "" }}
            </p>
        </RouterLink>
    </div>
</template>
