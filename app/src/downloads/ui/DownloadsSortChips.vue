<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { DOWNLOAD_SORTS, type DownloadSort } from "../page";

defineProps<{ active: DownloadSort }>();

defineEmits<{ select: [sort: DownloadSort] }>();

const { t } = useI18n();
</script>

<template>
    <div
        class="flex flex-wrap gap-2"
        role="radiogroup"
        :aria-label="t('downloads.page.sort.label')"
    >
        <button
            v-for="order in DOWNLOAD_SORTS"
            :key="order"
            type="button"
            role="radio"
            :aria-checked="order === active"
            :data-test="`downloads-sort-${order}`"
            class="rounded-full px-3 py-1 text-sm transition-colors"
            :class="
                order === active
                    ? 'bg-zinc-100 text-yellow-700 ring-1 ring-yellow-700/50 dark:bg-slate-700 dark:text-yellow-400 dark:ring-yellow-400/50'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            "
            @click="$emit('select', order)"
        >
            {{ t(`downloads.page.sort.${order}`) }}
        </button>
    </div>
</template>
