<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import type { Component } from "vue";
import type { RouteLocationRaw } from "vue-router";

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
</script>

<template>
    <transition
        enter-active-class="transition ease duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
    >
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
                <h1 class="flex items-center gap-2 text-lg font-semibold leading-7">
                    <component :is="icon" v-if="icon" class="h-5 w-5 text-zinc-500" />
                    {{ title }}
                    <slot name="postTitleSlot"></slot>
                </h1>

                <div v-if="$slots.actions">
                    <slot name="actions" />
                </div>
            </header>

            <div>
                <slot />
            </div>
        </div>
    </transition>
</template>
