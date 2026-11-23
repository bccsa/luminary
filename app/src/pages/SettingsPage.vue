<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LDialog from "@/components/common/LDialog.vue";
import LToggle from "@/components/form/LToggle.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { db, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useI18n } from "vue-i18n";
import {
    getDeviceInfo,
    isDataSaverEnabled,
    dataSaverLevel,
    effectiveDataSaverLevel,
    type DataSaverLevel,
    subtitlesOnVideo,
    autoplayNext,
    localCacheVersion,
    youtubeAlwaysAllow,
} from "@/globalConfig";
import { useNetworkSpeedEstimator } from "@/composables/useNetworkSpeedEstimator";
import BasePage from "@/components/BasePage.vue";
import AppVersionCard from "@/components/appUpdate/AppVersionCard.vue";
import { triggerSync } from "@/sync";
import { markPageReady } from "@/util/renderState";
import { clearUserActivity } from "@/userActivity/store";
import { useDownloads } from "@/build-time/contracts/downloads/token";
import { useKnownTexts } from "@/media-player/usePlayerMessages";
import { autoplayDownloadedOnly, useAutoplayMode } from "@/media-player/autoplayMode";

const { t } = useI18n();
/** A string the language may not have yet: its English shows rather than the bare key. */
const { textOr } = useKnownTexts();

onMounted(async () => {
    await nextTick();
    markPageReady();
});

const { addNotification } = useNotificationStore();

const deviceInfo = getDeviceInfo();

// Live, probe-based connection-speed estimate (refreshes itself on focus / regained connectivity).
const { connectionSpeed, isSlowConnection } = useNetworkSpeedEstimator();
const browserDataSaverEnabled = isDataSaverEnabled();
const dataSaverLevels: DataSaverLevel[] = ["off", "light", "strict"];
const dataSaverEnglish: Record<DataSaverLevel, { name: string; description: string }> = {
    off: { name: "Off", description: "Videos and images in full quality." },
    light: {
        name: "Light",
        description: "Videos play in their lowest quality, and images are lighter.",
    },
    strict: {
        name: "Strict",
        description:
            "As Light, and videos start with the sound only. You can switch to the picture at any time.",
    },
};
const dataSaverName = (level: DataSaverLevel) =>
    textOr(`settings.data_saver.${level}`, dataSaverEnglish[level].name);
const dataSaverDescription = (level: DataSaverLevel) =>
    textOr(`settings.data_saver.${level}_description`, dataSaverEnglish[level].description);
const dataSaverNote = computed(() => {
    // The device's own Data Saver stands in until a level is chosen here.
    if (browserDataSaverEnabled && dataSaverLevel.value === null) {
        return textOr(
            "settings.data_saver.browser_note",
            "Your device's Data Saver is on, so Light is used until you choose a level here.",
        );
    }
    if (isSlowConnection.value && effectiveDataSaverLevel.value === "off") {
        return t("settings.data_saver.slow_connection_note");
    }
    return "";
});

const isClearing = ref(false);

const showClearActivityDialog = ref(false);

/** Erases everything My Activity shows. Confirmed first: likes and highlights are the user's own. */
const clearActivity = async () => {
    showClearActivityDialog.value = false;
    await clearUserActivity();
    addNotification({
        title: t("settings.clear_activity.notification.title"),
        description: t("settings.clear_activity.notification.description"),
        state: "success",
        type: "toast",
    });
};

const downloads = useDownloads();
/** What deleting the downloads left: the ids still on the device, and the one of them kept for being played. */
type RemoveAllOutcome = { kept: string[]; playing?: string };
/** Where there are downloads, autoplay can be kept to them; offline it is, whatever the choice. */
const autoplayMode = computed(() => useAutoplayMode(downloads.value));
const showDeleteLocalDataDialog = ref(false);
const alsoDeleteDownloads = ref(false);

const notifyOffline = () =>
    addNotification({
        title: t("notification.clearCache_offline.title"),
        description: t("notification.clearCache_offline.description"),
        state: "error",
        type: "toast",
    });

/** With downloads on the device, the viewer first chooses whether they go too. */
const requestDeleteLocalData = () => {
    if (!isConnected.value) return notifyOffline();
    if (!downloads.value?.entries.value.length) return deleteLocalData();
    alsoDeleteDownloads.value = false;
    showDeleteLocalDataDialog.value = true;
};

const confirmDeleteLocalData = () => {
    showDeleteLocalDataDialog.value = false;
    return deleteLocalData(alsoDeleteDownloads.value);
};

/** Says which downloads stayed: the one being played was kept for it, any other could not be deleted. */
const tellKept = ({ kept, playing }: RemoveAllOutcome) => {
    if (playing && kept.includes(playing)) {
        addNotification({
            title: textOr("downloads.notice.kept_playing", "A download that is playing was kept."),
            state: "info",
            type: "toast",
        });
    }
    if (kept.some((id) => id !== playing)) {
        addNotification({
            title: textOr("downloads.notice.kept_failed", "Some downloads could not be deleted."),
            state: "error",
            type: "toast",
        });
    }
};

const deleteLocalData = async (withDownloads = false) => {
    if (!isConnected.value) return notifyOffline();

    isClearing.value = true;
    const service = downloads.value;
    try {
        let removedAll = false;
        let outcome: RemoveAllOutcome = { kept: [] };
        if (service && withDownloads) {
            try {
                outcome = await service.lifecycle.removeAll();
                removedAll = true;
            } catch (error) {
                console.error(error);
                outcome = { kept: service.entries.value.map((entry) => entry.downloadId) };
            }
        }
        await db.purge();
        // Invalidate the kept-alive overview pages so they re-create from the now-empty cache
        // instead of showing their pre-purge state.
        localCacheVersion.value++;
        triggerSync();
        // The purge clears the retention pins that keep a download's docs; the re-check puts them back.
        // It also runs by itself on the next connect, so a failure here is not the viewer's concern.
        if (service && (!removedAll || outcome.kept.length > 0)) {
            service.lifecycle.recheck().catch(() => undefined);
        }

        addNotification({
            title: t("notification.clearCache_success.title"),
            description: t("notification.clearCache_success.description"),
            state: "success",
            type: "toast",
        });
        tellKept(outcome);
    } finally {
        isClearing.value = false;
    }
};
</script>

<template>
    <BasePage showBackButton>
        <div class="space-y-4 px-2">
            <LCard :title="t('settings.local_cache.title')">
                <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                    {{ t("settings.local_cache.description") }}
                </div>
                <LButton
                    @click="requestDeleteLocalData"
                    :disabled="isClearing"
                    :icon="isClearing ? LoadingSpinner : undefined"
                    data-test="deleteLocalDatabase"
                >
                    {{
                        isClearing
                            ? t("settings.local_cache.button_clearing")
                            : t("settings.local_cache.button")
                    }}
                </LButton>
            </LCard>
            <LCard :title="t('settings.clear_activity.title')">
                <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                    {{ t("settings.clear_activity.description") }}
                </div>
                <LButton @click="showClearActivityDialog = true" data-test="clearUserActivity">
                    {{ t("settings.clear_activity.button") }}
                </LButton>
            </LCard>
            <AppVersionCard />
            <LCard :title="t('settings.device_info.title')">
                <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                    {{ t("settings.device_info.description") }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">OS:</span>
                    {{ deviceInfo.platform }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Browser:</span>
                    {{ deviceInfo.userAgent }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Connection speed:</span>
                    {{ connectionSpeed.toFixed(1) }} Mbps
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Connection state:</span>
                    {{ isConnected ? "Online" : "Offline" }}
                </div>
            </LCard>
            <LCard :title="t('settings.data_saver.title')">
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    {{
                        textOr(
                            "settings.data_saver.description",
                            "Choose how much data to save. Images also get lighter by themselves on slow connections.",
                        )
                    }}
                </div>
                <div
                    class="mt-3 inline-flex rounded-full bg-zinc-100 p-1 dark:bg-slate-700"
                    role="radiogroup"
                    :aria-label="t('settings.data_saver.title')"
                    data-test="dataSaverLevels"
                >
                    <button
                        v-for="level in dataSaverLevels"
                        :key="level"
                        type="button"
                        role="radio"
                        :aria-checked="effectiveDataSaverLevel === level"
                        class="min-h-[36px] rounded-full px-4 text-sm font-semibold"
                        :class="
                            effectiveDataSaverLevel === level
                                ? 'bg-white text-zinc-900 shadow dark:bg-slate-500 dark:text-white'
                                : 'text-zinc-600 dark:text-slate-300'
                        "
                        :data-test="`dataSaverLevel-${level}`"
                        @click="dataSaverLevel = level"
                    >
                        {{ dataSaverName(level) }}
                    </button>
                </div>
                <div
                    class="mt-2 text-sm text-zinc-600 dark:text-slate-100"
                    data-test="dataSaverLevelDescription"
                >
                    {{ dataSaverDescription(effectiveDataSaverLevel) }}
                </div>
                <div
                    v-if="dataSaverNote"
                    class="mt-3 text-sm text-zinc-600 dark:text-slate-100"
                    data-test="dataSaverNote"
                >
                    {{ dataSaverNote }}
                </div>
            </LCard>
            <LCard :title="textOr('settings.autoplay.title', 'Autoplay')">
                <div class="flex items-center justify-between gap-4">
                    <div class="text-sm text-zinc-600 dark:text-slate-100">
                        {{
                            textOr(
                                "settings.autoplay.description",
                                "When a video ends, play the next one by itself after a short countdown.",
                            )
                        }}
                    </div>
                    <LToggle v-model="autoplayNext" data-test="autoplayToggle" />
                </div>
                <div
                    v-if="downloads && autoplayMode"
                    class="mt-4 flex items-center justify-between gap-4"
                    data-test="autoplayDownloadedOnly"
                >
                    <div class="text-sm text-zinc-600 dark:text-slate-100">
                        <div class="mb-1 flex flex-wrap items-center gap-2">
                            <span class="font-semibold">
                                {{
                                    textOr(
                                        "settings.autoplay.downloaded_only",
                                        "Downloaded videos only",
                                    )
                                }}
                            </span>
                            <component
                                :is="downloads.ui.AutoplayModePill"
                                :mode="autoplayMode.mode.value"
                            />
                        </div>
                        {{
                            textOr(
                                "settings.autoplay.downloaded_only_description",
                                "Autoplay plays only videos saved on this device. Offline, only these can play.",
                            )
                        }}
                    </div>
                    <LToggle
                        v-model="autoplayDownloadedOnly"
                        :disabled="autoplayMode.locked.value"
                        data-test="autoplayDownloadedOnlyToggle"
                    />
                </div>
            </LCard>
            <LCard :title="t('settings.subtitles.title')">
                <div class="flex items-center justify-between gap-4">
                    <div class="text-sm text-zinc-600 dark:text-slate-100">
                        {{ t("settings.subtitles.description") }}
                    </div>
                    <LToggle v-model="subtitlesOnVideo" data-test="subtitlesOnVideoToggle" />
                </div>
            </LCard>
            <LCard :title="t('settings.youtube.title')">
                <div class="flex items-center justify-between gap-4">
                    <div class="text-sm text-zinc-600 dark:text-slate-100">
                        {{ t("settings.youtube.description") }}
                    </div>
                    <LToggle v-model="youtubeAlwaysAllow" data-test="youtubeAllowToggle" />
                </div>
            </LCard>
        </div>
        <LDialog
            v-model:open="showClearActivityDialog"
            :title="t('settings.clear_activity.modal.title')"
            :description="t('settings.clear_activity.modal.description')"
            :primaryAction="clearActivity"
            :primaryButtonText="t('settings.clear_activity.modal.button_clear')"
            :secondaryAction="() => (showClearActivityDialog = false)"
            :secondaryButtonText="t('settings.clear_activity.modal.button_cancel')"
            context="danger"
        />
        <LDialog
            v-if="downloads"
            v-model:open="showDeleteLocalDataDialog"
            :title="t('settings.local_cache.modal.title')"
            :description="t('settings.local_cache.modal.description')"
            :primaryAction="confirmDeleteLocalData"
            :primaryButtonText="t('settings.local_cache.modal.button_delete')"
            :secondaryAction="() => (showDeleteLocalDataDialog = false)"
            :secondaryButtonText="t('settings.local_cache.modal.button_cancel')"
            context="danger"
        >
            <component :is="downloads.ui.DeleteLocalDataOption" v-model="alsoDeleteDownloads" />
        </LDialog>
    </BasePage>
</template>
