<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDownTrayIcon } from "@heroicons/vue/20/solid";

type Props = {
    /** What autoplay plays next: everything, or only what is downloaded. */
    mode: "all" | "downloaded";
};
const props = defineProps<Props>();

const { t } = useI18n();

const label = computed(() =>
    props.mode === "downloaded"
        ? t("downloads.autoplay_mode.downloaded")
        : t("downloads.autoplay_mode.all"),
);
</script>

<template>
    <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1"
        :class="
            mode === 'downloaded'
                ? 'bg-yellow-100 text-yellow-900 ring-yellow-600/30 dark:bg-yellow-900/40 dark:text-yellow-100 dark:ring-yellow-500/30'
                : 'bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-500'
        "
        :title="t('downloads.autoplay_mode.label')"
        :data-mode="mode"
        data-test="autoplay-mode-pill"
    >
        <ArrowDownTrayIcon v-if="mode === 'downloaded'" class="h-3 w-3" aria-hidden="true" />
        {{ label }}
    </span>
</template>
