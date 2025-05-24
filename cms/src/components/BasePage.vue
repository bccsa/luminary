<script setup lang="ts">
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";
import { computed, type Component } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";

type Props = {
    title?: string;
    icon?: Component | Function;
    loading?: boolean;
    centered?: boolean;
    backLinkLocation?: RouteLocationRaw;
    backLinkText?: string;
    backLinkParams?: Record<string, string | undefined>;
    isFullWidth?: boolean;
};

withDefaults(defineProps<Props>(), {
    loading: false,
    centered: false,
    backLinkText: "Back",
    isFullWidth: false,
});

const overviewDocType = computed(() => {
    if (router.currentRoute.value.name != "overview") return;
    return router.currentRoute.value.params.docType;
});

const tagOrPostType = computed(() => {
    if (router.currentRoute.value.name != "overview") return;

    return router.currentRoute.value.params.tagOrPostType;
});

const topbarTitle = computed(() => {
    // Only try to get a title for content overviews
    if (router.currentRoute.value.name != "overview") return;

    // Convert the first letter to a capital letter for neatness
    return tagOrPostType.value
        ? tagOrPostType.value
              .toString()[0]
              .toUpperCase()
              .concat(tagOrPostType.value.toString().slice(1, tagOrPostType.value.length))
        : "Overview";
});

//  hasAnyPermission(props.docType, AclPermission.Edit)
const canCreateNew = computed(() => {
    if (router.currentRoute.value.name != "overview") return;

    return hasAnyPermission(overviewDocType.value as DocType, AclPermission.Edit);
});
</script>

<template>
    <TopBar>
        <template v-if="router.currentRoute.value.name == 'overview'" #quickActions>
            <h1 class="flex items-center gap-2 text-lg font-semibold leading-7">
                {{ topbarTitle }}
                overview
                <slot name="postTitleSlot"></slot>
            </h1>
            <div>
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    :is="RouterLink"
                    :class="{
                        'flex items-center justify-center': isSmallScreen,
                    }"
                    :to="{
                        name: `edit`,
                        params: {
                            docType: overviewDocType,
                            tagOrPostType: tagOrPostType,
                            id: 'new',
                        },
                    }"
                    data-test="create-button"
                >
                    {{ !isSmallScreen ? `Create ${overviewDocType}` : "" }}
                </LButton>
            </div>
        </template>
    </TopBar>

    <div v-if="!loading" :class="isFullWidth ? 'mx-0 w-full' : 'mx-auto max-w-7xl'">
        <RouterLink
            v-if="backLinkLocation"
            :to="backLinkLocation"
            :params="backLinkParams"
            class="-mx-2 mb-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200"
        >
            <ArrowLeftIcon class="h-4 w-4" /> {{ backLinkText }}
        </RouterLink>
        <header
            v-if="title || $slots.actions"
            :class="[
                'flex justify-between gap-4 pb-6 sm:flex-row sm:items-center',
                {
                    'sm:justify-center': centered,
                    'sm:justify-between': !centered,
                },
            ]"
        >
            <h1
                v-if="useRouter().currentRoute.value.name != 'overview'"
                class="flex items-center gap-2 text-lg font-semibold leading-7"
            >
                <component :is="icon" v-if="icon" class="h-5 w-5 text-zinc-500" />
                {{ title }}
                <slot name="postTitleSlot"></slot>
            </h1>

            <div v-if="$slots.actions && useRouter().currentRoute.value.name != 'overview'">
                <slot name="actions" />
            </div>
        </header>

        <div>
            <slot />
        </div>
    </div>
</template>
