<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { Bars3Icon, ChevronLeftIcon } from "@heroicons/vue/24/outline";
import { type Component } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import TopBar from "./navigation/TopBar.vue";
import { isSmallScreen } from "@/globalConfig";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";

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
    onOpenMobileSidebar?: () => void;
};

const props = withDefaults(defineProps<Props>(), {
    loading: false,
    shouldShowPageTitle: true,
    centered: false,
    backLinkText: "Back",
    isFullWidth: false,
});

const router = useRouter();
const isEditContentPage = router.currentRoute.value.name === "edit";
const isEditLanguagePage = router.currentRoute.value.name === "language";
const breakpoints = useBreakpoints(breakpointsTailwind);
const isMobileScreen = breakpoints.smaller("lg");

const handleMobileSidebarToggle = () => {
    if (isEditContentPage) router.push({ name: "overview" });
    else if (isEditLanguagePage) router.push({ name: "languages" });
    else props.onOpenMobileSidebar?.();
};
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden">
        <div class="flex-shrink-0">
            <div
                class="flex h-12 shrink-0 items-center gap-x-3 bg-white py-8 shadow-sm sm:gap-x-3"
                :class="[
                    { 'border-b border-zinc-200': !$slots.internalPageHeader },
                    isSmallScreen ? 'sm:pl-5 sm:pr-1' : 'lg:pl-9 lg:pr-5',
                ]"
            >
                <button
                    v-if="isEditContentPage || isMobileScreen || isEditLanguagePage"
                    type="button"
                    data-test="chevron-icon"
                    class="text-zinc-500 max-sm:ml-5"
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
                        <div
                            :class="{
                                'flex justify-between': !$slots.pageNav && title,
                            }"
                            class="flex w-full items-center justify-between gap-2 sm:gap-4 lg:gap-6"
                        >
                            <h1
                                v-if="title"
                                class="text-md flex items-center gap-2 font-semibold leading-7"
                            >
                                {{ title }}
                            </h1>
                            <slot name="pageNav"></slot>
                        </div>
                    </template>

                    <template #contentActions>
                        <slot name="topBarActionsMobile" />
                        <slot name="topBarActionsDesktop" />
                    </template>
                </TopBar>
            </div>
        </div>
        <div
            v-if="!loading"
            :class="isFullWidth ? 'mx-auto w-full' : 'min-w-full max-w-7xl'"
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
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
                    'flex items-center justify-between gap-4 pl-4 pr-8 pt-4 sm:flex-row sm:items-center',
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

            <div class="w-full flex-shrink-0">
                <slot name="internalPageHeader" />
            </div>
            <div
                class="min-h-0 flex-1 overflow-y-auto scrollbar-hide"
                :class="[
                    isSmallScreen ? 'sm:ml-4 sm:pr-4' : 'lg:ml-8 lg:pr-8',
                    { 'sm:mt-1': !$slots.internalPageHeader },
                ]"
            >
                <slot />
            </div>
            <div
                v-if="$slots.footer"
                class="flex-shrink-0 border-t border-zinc-200 bg-white px-6 pb-2 pt-2 sm:px-6 lg:pb-4 lg:pr-8"
            >
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
