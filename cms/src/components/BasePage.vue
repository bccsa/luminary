<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import type { RouteLocationRaw } from "vue-router";

type Props = {
    title?: string;
    loading?: boolean;
    centered?: boolean;
    backLinkLocation?: RouteLocationRaw;
    backLinkText?: string;
};

withDefaults(defineProps<Props>(), {
    loading: false,
    centered: false,
    backLinkText: "Back",
});
</script>

<template>
    <transition
        enter-active-class="transition ease duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
    >
        <div v-if="!loading">
            <RouterLink
                v-if="backLinkLocation"
                :to="backLinkLocation"
                class="mb-1 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
                <ArrowLeftIcon class="h-4 w-4" /> {{ backLinkText }}
            </RouterLink>
            <header
                v-if="title || $slots.actions"
                :class="[
                    'flex flex-col gap-4 pb-6 sm:flex-row sm:items-center',
                    {
                        'sm:justify-center': centered,
                        'sm:justify-between': !centered,
                    },
                ]"
            >
                <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

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
