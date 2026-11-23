<script setup lang="ts">
import { useI18n } from "vue-i18n";

/** Only downloaded items show. */
const downloadedOnly = defineModel<boolean>({ default: false });

const { t } = useI18n();

const options = [
    { value: true, key: "downloads.watch_filter.downloaded", test: "downloaded" },
    { value: false, key: "downloads.watch_filter.all", test: "all" },
] as const;
</script>

<template>
    <div
        role="radiogroup"
        :aria-label="t('downloads.watch_filter.label')"
        class="inline-flex rounded-full bg-zinc-100 p-0.5 text-sm ring-1 ring-zinc-200 dark:bg-slate-700 dark:ring-slate-600"
        data-test="watch-filter-switch"
    >
        <button
            v-for="option in options"
            :key="option.test"
            type="button"
            role="radio"
            :aria-checked="downloadedOnly === option.value"
            :data-test="`watch-filter-${option.test}`"
            class="rounded-full px-3 py-1 font-medium transition-colors"
            :class="
                downloadedOnly === option.value
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-slate-500 dark:text-white'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-slate-300 dark:hover:text-white'
            "
            @click="downloadedOnly = option.value"
        >
            {{ t(option.key) }}
        </button>
    </div>
</template>
