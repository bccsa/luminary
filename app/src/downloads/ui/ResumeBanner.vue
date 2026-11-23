<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowPathIcon, ExclamationTriangleIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import { isInterrupted, remainingBytes, resumedByResumeAll } from "../entries";
import MeteredConfirmDialog from "./MeteredConfirmDialog.vue";

const service = inject(DownloadsKey, undefined);
const { t } = useI18n();

const interrupted = computed(() => service?.entries.value.filter(isInterrupted) ?? []);
// The question is asked only on mobile data, so it counts what Resume all resumes with consent.
const remaining = computed(() =>
    (service?.entries.value.filter((entry) => resumedByResumeAll(entry, true)) ?? []).reduce(
        (sum, entry) => sum + remainingBytes(entry, service?.progress.value.get(entry.downloadId)),
        0,
    ),
);

const asking = ref(false);
const resuming = ref(false);

async function resumeAll(meteredConsent: boolean) {
    if (!service) return;
    resuming.value = true;
    try {
        await service.resumeAll({ meteredConsent });
    } finally {
        resuming.value = false;
    }
}

function onResume() {
    // On mobile data the viewer chooses first; the answer travels with the resume.
    if (service?.network.value.metered) asking.value = true;
    else void resumeAll(false);
}
</script>

<template>
    <div
        v-if="interrupted.length > 0"
        class="flex items-center gap-3 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-950 ring-1 ring-yellow-600/30 dark:bg-yellow-900/30 dark:text-yellow-100 dark:ring-yellow-500/30"
        role="status"
        data-test="downloads-resume-banner"
    >
        <ExclamationTriangleIcon class="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
        <p class="min-w-0 flex-1">{{ t("downloads.resume_banner.message") }}</p>
        <LButton
            size="sm"
            :icon="ArrowPathIcon"
            :disabled="resuming"
            data-test="downloads-resume-all"
            @click="onResume"
        >
            {{ t("downloads.resume_banner.resume_all") }}
        </LButton>
        <MeteredConfirmDialog v-model:open="asking" :bytes="remaining" @confirm="resumeAll(true)" />
    </div>
</template>
