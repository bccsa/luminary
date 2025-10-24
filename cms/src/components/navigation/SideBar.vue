<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
    DocumentDuplicateIcon,
    TagIcon,
    HomeIcon,
    ChevronRightIcon,
    RectangleStackIcon,
    GlobeEuropeAfricaIcon,
    ArrowUturnRightIcon,
    UsersIcon,
    CloudIcon,
} from "@heroicons/vue/20/solid";

import { appName, isDevMode, logo, sidebarSectionExpanded } from "@/globalConfig";
import { computed } from "vue";
import { AclPermission, DocType, PostType, TagType, hasAnyPermission } from "luminary-shared";
import ProfileMenu from "./ProfileMenu.vue";
import OnlineIndicator from "../OnlineIndicator.vue";

type NavigationEntry = {
    name: string;
    to?: { name: string; params?: Record<string, string | number> };
    icon?: any;
    open?: boolean;
    visible?: boolean;
    children?: NavigationEntry[];
};

defineEmits(["close"]);

const navigation = computed(() => [
    { name: "Dashboard", to: { name: "dashboard" }, icon: HomeIcon, visible: true },
    {
        name: "Posts",
        icon: DocumentDuplicateIcon,
        open: sidebarSectionExpanded.value.posts,
        visible: hasAnyPermission(DocType.Post, AclPermission.View),
        children: Object.entries(PostType).map((p) => ({
            name: p[0],
            to: { name: "overview", params: { docType: DocType.Post, tagOrPostType: p[1] } },
        })),
    },
    {
        name: "Tags",
        icon: TagIcon,
        open: sidebarSectionExpanded.value.tags,
        visible: hasAnyPermission(DocType.Tag, AclPermission.View),
        children: Object.entries(TagType).map((t) => ({
            name: t[0],
            to: { name: "overview", params: { docType: DocType.Tag, tagOrPostType: t[1] } },
        })),
    },
    {
        name: "Groups",
        to: { name: "groups" },
        icon: RectangleStackIcon,
        visible: hasAnyPermission(DocType.Group, AclPermission.View),
    },
    {
        name: "Redirects",
        to: { name: "redirects" },
        icon: ArrowUturnRightIcon,
        visible: hasAnyPermission(DocType.Redirect, AclPermission.View),
    },
    {
        name: "Languages",
        to: { name: "languages" },
        icon: GlobeEuropeAfricaIcon,
        visible: hasAnyPermission(DocType.Language, AclPermission.View),
    },
    {
        name: "S3 Storage",
        to: { name: "s3-storage" },
        icon: CloudIcon,
        visible: hasAnyPermission(DocType.Storage, AclPermission.View),
    },
    {
        name: "Users",
        to: { name: "users" },
        icon: UsersIcon,
        visible: hasAnyPermission(DocType.User, AclPermission.View),
    },
]);

const toggleOpen = (item: NavigationEntry) => {
    if (item.name === "Posts") {
        sidebarSectionExpanded.value.posts = !sidebarSectionExpanded.value.posts;
    } else if (item.name === "Tags") {
        sidebarSectionExpanded.value.tags = !sidebarSectionExpanded.value.tags;
    }
};
</script>

<template>
    <div
        @scroll.stop
        class="static flex max-h-screen grow flex-col border-r border-zinc-200 bg-zinc-100"
    >
        <div class="flex h-16 w-full shrink-0 items-center justify-start gap-2 pl-5 pt-1">
            <img class="h-8" :src="logo" :alt="appName" />
            <span
                v-if="isDevMode"
                class="ml-2 rounded-lg bg-red-400 px-1 py-0.5 text-sm text-red-950"
            >
                DEV
            </span>
        </div>
        <nav class="mx-2 flex flex-1 flex-col gap-y-5 overflow-hidden">
            <div class="flex-1 overflow-y-auto">
                <ul role="list" class="space-y-1 pt-3">
                    <li v-for="item in navigation" :key="item.name">
                        <RouterLink
                            v-if="item.visible && !item.children && item.to"
                            :to="item.to"
                            active-class="bg-zinc-200 text-zinc-950"
                            class="group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 text-zinc-700 hover:bg-zinc-200"
                            v-slot="{ isActive }"
                            @click.prevent="$emit('close')"
                        >
                            <component
                                :is="item.icon"
                                :class="[isActive ? 'text-zinc-800' : 'text-zinc-600']"
                                class="h-6 w-6 shrink-0"
                                aria-hidden="true"
                            />
                            {{ item.name }}
                        </RouterLink>
                        <div v-else-if="item.visible && item.children">
                            <button
                                @click="toggleOpen(item)"
                                class="flex w-full items-center gap-x-3 rounded-md p-2 text-left text-sm font-semibold leading-6 text-zinc-700"
                            >
                                <component
                                    :is="item.icon"
                                    class="h-6 w-6 shrink-0 text-zinc-600"
                                    aria-hidden="true"
                                />
                                {{ item.name }}
                                <ChevronRightIcon
                                    :class="[
                                        item.open ? 'rotate-90 text-zinc-500' : 'text-zinc-400',
                                        'ml-auto h-5 w-5 shrink-0',
                                    ]"
                                    aria-hidden="true"
                                />
                            </button>

                            <ul v-show="item.open" class="mt-1 space-y-1 px-2">
                                <li v-for="subItem in item.children" :key="subItem.name">
                                    <RouterLink
                                        :to="subItem.to"
                                        active-class="bg-zinc-200 text-zinc-900"
                                        class="block rounded-md py-2 pl-9 pr-2 text-sm font-medium leading-6 text-zinc-700 hover:bg-zinc-200"
                                        @click.prevent="$emit('close')"
                                    >
                                        {{ subItem.name }}
                                    </RouterLink>
                                </li>
                            </ul>
                        </div>
                    </li>
                </ul>
            </div>
        </nav>
        <div class="flex w-full flex-col justify-between gap-2 rounded-md p-1 pb-4 pl-4">
            <OnlineIndicator />
            <div class="flex w-full items-center">
                <ProfileMenu />
            </div>
        </div>
    </div>
</template>
