<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import {
    ArrowDownIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    NoSymbolIcon,
} from "@heroicons/vue/20/solid";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";

type Props = {
    parentId: string;
};
const props = defineProps<Props>();

const service = inject(DownloadsKey, undefined);
const { t } = useI18n();

// Read through its own computed, so a progress tick on another tile does not re-render this one.
const badge = computed(() => service?.badges.value.get(props.parentId));

const RING = 2 * Math.PI * 9;

const label = computed(() => {
    const b = badge.value;
    if (!b) return "";
    switch (b.state) {
        case "progress":
            return t("downloads.badge.progress", { percent: b.percent });
        case "downloaded":
            return b.partial ? t("downloads.badge.partial") : t("downloads.badge.downloaded");
        case "attention":
            return t("downloads.badge.attention");
        case "unavailable":
            return t("downloads.badge.unavailable");
        default:
            return "";
    }
});
</script>

<template>
    <span
        v-if="badge && badge.state !== 'none'"
        role="img"
        :aria-label="label"
        :title="label"
        :data-state="badge.state"
        data-test="download-badge"
        class="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-sm ring-1"
        :class="{
            'bg-white/90 text-zinc-800 ring-zinc-300 dark:bg-slate-700/90 dark:text-slate-100 dark:ring-slate-500':
                badge.state === 'progress',
            'bg-yellow-400 text-yellow-950 ring-yellow-600/60': badge.state === 'downloaded',
            'bg-red-500 text-white ring-red-700/60': badge.state === 'attention',
            'bg-zinc-200 text-zinc-600 ring-zinc-300 dark:bg-slate-600 dark:text-slate-300 dark:ring-slate-500':
                badge.state === 'unavailable',
        }"
    >
        <template v-if="badge.state === 'progress'">
            <svg class="absolute inset-0 h-6 w-6 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
                <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="opacity-20"
                />
                <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    class="stroke-yellow-500"
                    :stroke-dasharray="RING"
                    :stroke-dashoffset="RING * (1 - badge.percent / 100)"
                />
            </svg>
            <ArrowDownIcon class="relative h-3.5 w-3.5" aria-hidden="true" />
        </template>
        <template v-else-if="badge.state === 'downloaded'">
            <CheckIcon class="h-4 w-4" aria-hidden="true" />
            <span
                v-if="badge.partial"
                class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-white ring-1 ring-yellow-600/60 dark:bg-slate-800"
                data-test="download-badge-partial"
                aria-hidden="true"
            />
        </template>
        <ExclamationTriangleIcon
            v-else-if="badge.state === 'attention'"
            class="h-3.5 w-3.5"
            aria-hidden="true"
        />
        <NoSymbolIcon v-else class="h-3.5 w-3.5" aria-hidden="true" />
    </span>
</template>
