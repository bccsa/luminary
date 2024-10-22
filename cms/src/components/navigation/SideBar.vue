<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import {
    DocumentDuplicateIcon,
    TagIcon,
    HomeIcon,
    ChevronRightIcon,
    RectangleStackIcon,
    GlobeEuropeAfricaIcon,
} from "@heroicons/vue/20/solid";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { ref, watch, type Component } from "vue";
import { AclPermission, DocType, PostType, TagType, hasAnyPermission } from "luminary-shared";

const { appName, isDevMode } = useGlobalConfigStore();
const route = useRoute();

type NavigationEntry = {
    name: string;
    to?: { name: string; params?: Record<string, string | number> };
    icon?: Component;
    open?: boolean;
    visible?: boolean;
    children?: NavigationEntry[];
};

const navigation = ref<NavigationEntry[]>([
    { name: "Dashboard", to: { name: "dashboard" }, icon: HomeIcon, visible: true },
    {
        name: "Posts",
        icon: DocumentDuplicateIcon,
        open: false,
        visible: hasAnyPermission(DocType.Post, AclPermission.View),
        children: Object.entries(PostType).map((p) => ({
            name: p[0],
            to: { name: "overview", params: { docType: DocType.Post, tagOrPostType: p[1] } },
        })),
    },
    {
        name: "Tags",
        icon: TagIcon,
        open: false,
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
        name: "Languages",
        to: { name: "languages" },
        icon: GlobeEuropeAfricaIcon,
        visible: hasAnyPermission(DocType.Language, AclPermission.View),
    },
]);

watch(route, (newRoute) => {
    navigation.value = navigation.value.map((item) => {
        if (!item.children) return item;

        item.children.forEach((subItem) => {
            if (subItem.to?.params?.docType == newRoute.params.docType) {
                item.open = true;
            }
        });

        return item;
    });
});
</script>

<template>
    <div
        class="flex grow flex-col gap-y-5 overflow-y-auto border-r border-zinc-200 bg-zinc-100 px-6 pb-4"
    >
        <div class="flex h-16 shrink-0 items-center">
            <img class="w-42" src="@/assets/logo.svg" :alt="appName" />
            <span
                v-if="isDevMode"
                class="ml-2 rounded-lg bg-red-400 px-1 py-0.5 text-sm text-red-950"
            >
                DEV
            </span>
        </div>
        <nav class="flex flex-1 flex-col">
            <ul role="list" class="flex flex-1 flex-col gap-y-7">
                <li>
                    <ul role="list" class="-mx-2 space-y-1">
                        <li v-for="item in navigation" :key="item.name">
                            <RouterLink
                                v-if="item.visible && !item.children && item.to"
                                :to="item.to"
                                active-class="bg-zinc-200 text-zinc-950"
                                class="group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 text-zinc-700 hover:bg-zinc-200"
                                v-slot="{ isActive }"
                            >
                                <component
                                    :is="item.icon"
                                    :class="[isActive ? 'text-zinc-800' : 'text-zinc-600']"
                                    class="h-6 w-6 shrink-0"
                                    aria-hidden="true"
                                />
                                {{ item.name }}
                            </RouterLink>
                            <Disclosure as="div" v-else-if="item.visible" v-slot="{ open }">
                                <DisclosureButton
                                    :class="[
                                        'flex w-full items-center gap-x-3 rounded-md p-2 text-left text-sm font-semibold leading-6 text-zinc-700',
                                    ]"
                                    @click="item.open = !item.open"
                                >
                                    <component
                                        :is="item.icon"
                                        class="h-6 w-6 shrink-0 text-zinc-600"
                                        aria-hidden="true"
                                    />
                                    {{ item.name }}
                                    <ChevronRightIcon
                                        :class="[
                                            open || item.open
                                                ? 'rotate-90 text-zinc-500'
                                                : 'text-zinc-400',
                                            'ml-auto h-5 w-5 shrink-0',
                                        ]"
                                        aria-hidden="true"
                                    />
                                </DisclosureButton>
                                <DisclosurePanel
                                    as="ul"
                                    class="mt-1 space-y-1 px-2"
                                    static
                                    v-show="open || item.open"
                                >
                                    <li v-for="subItem in item.children" :key="subItem.name">
                                        <DisclosureButton
                                            :as="RouterLink"
                                            :to="subItem.to"
                                            active-class="bg-zinc-200 text-zinc-900"
                                            class="block rounded-md py-2 pl-9 pr-2 text-sm font-medium leading-6 text-zinc-700 hover:bg-zinc-200"
                                        >
                                            {{ subItem.name }}
                                        </DisclosureButton>
                                    </li>
                                </DisclosurePanel>
                            </Disclosure>
                        </li>
                    </ul>
                </li>
            </ul>
        </nav>
    </div>
</template>
