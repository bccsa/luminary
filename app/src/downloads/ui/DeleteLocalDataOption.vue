<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import { formatBytes } from "../texts";

/** Whether downloads go too; off unless the viewer ticks it. */
const deleteDownloads = defineModel<boolean>({ default: false });

const service = inject(DownloadsKey, undefined);
const { t, locale } = useI18n();

const hasDownloads = computed(() => (service?.entries.value.length ?? 0) > 0);
const label = computed(() =>
    t("downloads.delete_local_data.option", {
        size: formatBytes(service?.lifecycle.totalBytes.value ?? 0, locale.value),
    }),
);
</script>

<template>
    <label
        v-if="hasDownloads"
        class="flex cursor-pointer items-center gap-3 py-3 text-sm"
        data-test="delete-local-data-downloads"
    >
        <input
            v-model="deleteDownloads"
            type="checkbox"
            class="h-4 w-4 rounded border-zinc-300 text-yellow-500 focus:ring-yellow-500 dark:border-slate-500 dark:bg-slate-600"
        />
        <span>{{ label }}</span>
    </label>
</template>
