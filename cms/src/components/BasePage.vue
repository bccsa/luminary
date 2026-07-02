<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { Bars3Icon, ChevronLeftIcon } from "@heroicons/vue/24/outline";
import { type Component, computed, provide, ref } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import TopBar from "./navigation/TopBar.vue";
import LoadingBar from "./LoadingBar.vue";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { basePageScrollKey } from "@/keys/basePageScroll";

type Props = {
    title?: string;
    shouldShowPageTitle?: boolean;
    icon?: Component | Function;
    loading?: boolean;
    centered?: boolean;
    backLinkLocation?: RouteLocationRaw;
    backLinkText?: string;
    backLinkParams?: Record<string, string | undefined>;
    isFullWidth?: boolean;
    contentInset?: boolean;
    onOpenMobileSidebar?: () => void;
};

const props = withDefaults(defineProps<Props>(), {
    loading: false,
    shouldShowPageTitle: true,
    centered: false,
    backLinkText: "Back",
    isFullWidth: false,
    contentInset: true,
});

const router = useRouter();
const isEditContentPage = computed(() => router.currentRoute.value.name === "edit");
const isEditLanguagePage = computed(() => router.currentRoute.value.name === "language");
const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobileScreen = breakpoints.smaller("lg");

const scrollContainer = ref<HTMLElement | null>(null);
provide(basePageScrollKey, scrollContainer);

/** Horizontal inset for chrome controls (top bar, filter row). Always includes mobile padding. */
const chromeInsetClasses = computed(() => {
    if (!props.contentInset) return "";
    return "px-3 lg:px-8";
});

/** Horizontal inset for scrollable page content — desktop only; mobile list rows bleed edge-to-edge. */
const contentInsetClasses = computed(() => {
    if (!props.contentInset) return "";
    return "lg:px-8";
});

const topBarInsetClasses = computed(() => {
    if (!props.contentInset) {
        if (isEditContentPage.value || isEditLanguagePage.value) {
            return isMobileScreen.value ? "px-3" : "lg:px-8";
        }
        return "pl-4 pr-3 lg:pl-9 lg:pr-5";
    }
    return chromeInsetClasses.value;
});

const handleMobileSidebarToggle = () => {
    if (isEditContentPage.value) router.push({ name: "overview" });
    else if (isEditLanguagePage.value) router.push({ name: "languages" });
    else props.onOpenMobileSidebar?.();
};
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden">
        <div
            :class="isFullWidth ? 'mx-auto w-full' : 'min-w-full max-w-7xl'"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
            <div class="relative z-30 flex-shrink-0">
                <div
                    data-topbar
                    class="flex h-12 shrink-0 items-center gap-x-3 bg-white shadow-sm sm:gap-x-3"
                    :class="[
                        { 'border-b border-zinc-200': !$slots.internalPageHeader },
                        topBarInsetClasses,
                    ]"
                >
                    <button
                        v-if="isEditContentPage || isMobileScreen || isEditLanguagePage"
                        type="button"
                        data-test="chevron-icon"
                        class="text-zinc-500"
                        :class="{
                            'ml-1.5 max-lg:ml-0 max-lg:-ml-1':
                                isEditContentPage || isEditLanguagePage,
                        }"
                        @click="handleMobileSidebarToggle"
                    >
                        <span class="sr-only">Open sidebar</span>
                        <Bars3Icon
                            v-if="!isEditContentPage && !isEditLanguagePage && isMobileScreen"
                            class="h-6 w-6"
                            aria-hidden="true"
                        />
                        <ChevronLeftIcon
                            v-else-if="isEditContentPage || isEditLanguagePage"
                            class="size-5"
                            aria-hidden="true"
                        />
                    </button>

                    <!-- Separator -->
                    <div
                        class="h-6 w-px bg-zinc-900/10"
                        :class="{ hidden: !isEditContentPage && !isEditLanguagePage }"
                        aria-hidden="true"
                    />

                    <TopBar>
                        <template #quickActions>
                            <div class="flex w-full min-w-0 items-center justify-between gap-2">
                                <h1
                                    v-if="title"
                                    class="text-md flex min-w-0 items-center gap-2 truncate font-semibold leading-7"
                                >
                                    {{ title }}
                                </h1>
                                <div
                                    v-if="$slots.pageNav || $slots.languageSelector"
                                    class="flex shrink-0 items-center gap-1"
                                >
                                    <slot name="pageNav"></slot>
                                    <slot name="languageSelector"></slot>
                                </div>
                            </div>
                        </template>

                        <template
                            v-if="$slots.topBarActionsMobile || $slots.topBarActionsDesktop"
                            #contentActions
                        >
                            <slot name="topBarActionsMobile" />
                            <slot name="topBarActionsDesktop" />
                        </template>
                    </TopBar>
                </div>
            </div>
            <div v-if="loading" class="flex min-h-0 flex-1 items-center justify-center">
                <LoadingBar />
            </div>
            <template v-else>
                <RouterLink
                    v-if="backLinkLocation"
                    :to="backLinkLocation"
                    :params="backLinkParams"
                    class="-mx-2 mb-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 sm:pl-6"
                >
                    <ArrowLeftIcon class="h-4 w-4" /> {{ backLinkText }}
                </RouterLink>
                <header
                    v-if="$slots.actions"
                    :class="[
                        'flex items-center justify-between gap-4 pt-4 sm:flex-row sm:items-center',
                        '',
                        {
                            'sm:justify-center': centered,
                            'sm:justify-between': !centered,
                        },
                    ]"
                >
                    <h1
                        class="flex items-center gap-2 text-lg font-semibold leading-7"
                        v-if="shouldShowPageTitle"
                    >
                        <component :is="icon" v-if="icon" class="h-5 w-5 text-zinc-500" />
                        {{ title }}
                    </h1>

                    <div v-if="$slots.actions">
                        <slot name="actions" />
                    </div>
                </header>

                <div
                    v-if="$slots.internalPageHeader"
                    class="w-full flex-shrink-0 border-b border-t border-zinc-300 border-t-zinc-100 bg-white shadow"
                >
                    <div class="py-2" :class="chromeInsetClasses">
                        <slot name="internalPageHeader" />
                    </div>
                </div>

                <div
                    data-test="base-page-content"
                    class="flex min-h-0 flex-1 flex-col"
                    :class="contentInsetClasses"
                >
                    <div
                        ref="scrollContainer"
                        data-test="base-page-scroll-container"
                        class="flex min-h-0 flex-1 flex-col scrollbar-hide"
                        :class="[
                            {
                                'mt-[3px]': contentInset && $slots.internalPageHeader,
                                'mt-1': contentInset && !$slots.internalPageHeader,
                            },
                            isEditContentPage
                                ? 'overflow-y-auto lg:overflow-hidden'
                                : 'overflow-y-auto',
                        ]"
                    >
                        <slot />
                    </div>
                    <div
                        v-if="$slots.footer"
                        data-test="base-page-footer"
                        class="flex-shrink-0 border-t border-zinc-200 bg-white pb-2 pt-2 lg:pb-4"
                        :class="contentInset && contentInsetClasses"
                    >
                        <slot name="footer" />
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>
