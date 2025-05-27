<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { Bars3Icon } from "@heroicons/vue/24/outline";
import { ref, type Component } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import TopBar from "./navigation/TopBar.vue";
import MobileSideBar from "./navigation/MobileSideBar.vue";
import SideBar from "./navigation/SideBar.vue";

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
};

withDefaults(defineProps<Props>(), {
    loading: false,
    shouldShowPageTitle: true,
    centered: false,
    backLinkText: "Back",
    isFullWidth: false,
});

const sidebarOpen = ref(false);
</script>

<template>
    <div>
        <!-- Top bar -->
        <MobileSideBar v-model:open="sidebarOpen" />

        <!-- Static sidebar for desktop -->
        <div class="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-72 lg:flex-col">
            <SideBar />
        </div>

        <div class="lg:pl-72">
            <div
                class="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8"
            >
                <button
                    type="button"
                    class="-m-2.5 p-2.5 text-zinc-700 lg:hidden"
                    @click="sidebarOpen = true"
                >
                    <span class="sr-only">Open sidebar</span>
                    <Bars3Icon class="h-6 w-6" aria-hidden="true" />
                </button>

                <!-- Separator -->
                <div class="h-6 w-px bg-zinc-900/10 lg:hidden" aria-hidden="true" />

                <TopBar>
                    <template #quickActions>
                        <h1
                            v-if="!$slots.actions"
                            class="flex items-center gap-2 text-lg font-semibold leading-7"
                        >
                            {{ title }}
                        </h1>
                        <slot name="pageNav"> </slot>
                    </template>
                </TopBar>
            </div>
        </div>
        <div v-if="!loading" :class="isFullWidth ? ' mx-auto w-full ' : 'mx-auto max-w-7xl'">
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
                    'flex items-center justify-between gap-4 pl-4 pr-8 pt-4 sm:flex-row sm:items-center lg:pl-80',
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
                    <slot name="postTitleSlot"></slot>
                </h1>

                <div v-if="$slots.actions && useRouter().currentRoute.value.name != 'overview'">
                    <slot name="actions" />
                </div>
            </header>

            <div class="mt-4 px-4 sm:px-6 lg:ml-8 lg:pl-72 lg:pr-8">
                <slot />
            </div>

            <div class="mb-4 mt-2 px-4 sm:px-6 lg:ml-8 lg:pl-72 lg:pr-8">
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
