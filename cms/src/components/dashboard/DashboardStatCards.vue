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
            class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300 lg:flex-1"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <DocumentDuplicateIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Posts</span>
            </div>
            <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
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
            class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300 lg:flex-1"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <TagIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Tags</span>
            </div>
            <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                {{ tags.length }}
            </p>
            <p class="text-xs text-zinc-400">
                {{ contentByParentType.tag }} content item{{
                    contentByParentType.tag !== 1 ? "s" : ""
                }}
            </p>
        </RouterLink>

        <div class="rounded-lg border border-zinc-200 bg-white px-3 py-2 lg:flex-1">
            <div class="flex items-center gap-2 text-zinc-500">
                <CheckCircleIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Published</span>
            </div>
            <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                {{ publishedCount }}
            </p>
            <p v-if="draftCount > 0" class="text-xs text-zinc-400">
                {{ draftCount }} draft{{ draftCount !== 1 ? "s" : "" }}
            </p>
        </div>

        <div class="rounded-lg border border-zinc-200 bg-white px-3 py-2 lg:flex-1">
            <div class="flex items-center gap-2 text-zinc-500">
                <CalendarDaysIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Scheduled</span>
            </div>
            <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                {{ scheduledContent.length }}
            </p>
            <p v-if="expiredContent.length > 0" class="text-xs text-amber-500">
                {{ expiredContent.length }} expired
            </p>
        </div>

        <RouterLink
            v-if="canViewGroups"
            :to="{ name: 'groups' }"
            class="group rounded-lg border border-zinc-200 bg-white px-3 py-2 transition-colors hover:border-zinc-300 lg:flex-1"
        >
            <div class="flex items-center gap-2 text-zinc-500">
                <RectangleStackIcon class="h-4 w-4" />
                <span class="text-xs font-medium uppercase tracking-wide">Groups</span>
            </div>
            <p class="mt-0.5 text-xl font-semibold leading-tight text-zinc-900">
                {{ groups.length }}
            </p>
            <p class="text-xs text-zinc-400">
                {{ cmsLanguages.length }} language{{ cmsLanguages.length !== 1 ? "s" : "" }}
            </p>
        </RouterLink>
    </div>
</template>
