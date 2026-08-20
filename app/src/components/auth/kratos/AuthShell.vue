<script setup lang="ts">
import { ArrowLeftIcon } from "@heroicons/vue/24/outline";
import { useAuthCopy } from "./useAuthCopy";

type Props = {
    title: string;
    subtitle?: string;
    /** Shows the back affordance; the parent decides what going back means. */
    canGoBack?: boolean;
};
withDefaults(defineProps<Props>(), { canGoBack: false });
defineEmits<{ back: [] }>();

const c = useAuthCopy();
</script>

<template>
    <div
        class="w-full max-w-md rounded-lg border border-zinc-100 bg-white p-6 shadow dark:border-slate-800 dark:bg-slate-800"
    >
        <button
            v-if="canGoBack"
            type="button"
            class="-ml-1.5 mb-3 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            @click="$emit('back')"
        >
            <ArrowLeftIcon class="h-4 w-4" />
            {{ c("auth.common.back") }}
        </button>

        <div
            v-if="$slots.brand"
            class="mb-5"
        >
            <slot name="brand" />
        </div>

        <h1 class="text-xl font-semibold text-zinc-900 dark:text-slate-100">{{ title }}</h1>
        <p
            v-if="subtitle"
            class="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-slate-400"
        >
            {{ subtitle }}
        </p>

        <div class="mt-6 flex flex-col gap-4">
            <slot />
        </div>

        <div
            v-if="$slots.footer"
            class="mt-6 border-t border-zinc-100 pt-4 dark:border-slate-700"
        >
            <slot name="footer" />
        </div>
    </div>
</template>
