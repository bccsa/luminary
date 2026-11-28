<script setup lang="ts">
import { computed, inject, ref, watch, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { db, useDexieLiveQuery, type ContentDto } from "luminary-shared";
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    KeyIcon,
    MusicalNoteIcon,
    PauseIcon,
    PlayIcon,
    PlusIcon,
    SignalIcon,
    StopIcon,
    TrashIcon,
} from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import LDialog from "@/components/common/LDialog.vue";
import { useNotificationStore } from "@/stores/notification";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadEntry } from "@/build-time/contracts/downloads/contract";
import { contentFromSnapshot } from "../content";
import { displayedStatus, plannedBytes, remainingBytes, statusKey, storedBytes } from "../entries";
import { cardView, chapterCount, type CardAction } from "../page";
import { formatBytes } from "../texts";
import MeteredConfirmDialog from "./MeteredConfirmDialog.vue";

type Props = {
    entry: DownloadEntry;
    /** The list is choosing downloads to delete: a tap selects instead of opening the wizard. */
    selecting?: boolean;
    selected?: boolean;
    /** The player is playing this download, so it cannot be deleted now. */
    playing?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    selecting: false,
    selected: false,
    playing: false,
});
const emit = defineEmits<{ toggle: [] }>();

const service = inject(DownloadsKey, undefined);
const { t, locale } = useI18n();

const id = computed(() => props.entry.downloadId);
const title = computed(() => props.entry.content.title);

// Read as numbers, so a progress tick re-renders only the card whose figures changed.
const bytesDone = computed(() => service?.progress.value.get(id.value)?.bytesDone);
const bytesTotal = computed(() => service?.progress.value.get(id.value)?.bytesTotal);
const liveProgress = () =>
    bytesDone.value === undefined
        ? undefined
        : {
              downloadId: id.value,
              bytesDone: bytesDone.value,
              bytesTotal: bytesTotal.value ?? 0,
              bytesPerSecond: 0,
              units: {},
          };

const shown = computed(() => displayedStatus(props.entry, liveProgress()));
const percent = computed(() => Math.floor(shown.value.progress * 100));
const transferring = computed(
    () => shown.value.status !== "complete" && props.entry.status !== "revoked",
);
const statusText = computed(() => t(statusKey(props.entry, liveProgress())));

const size = (bytes: number) => formatBytes(bytes, locale.value);
const sizeText = computed(() => {
    const planned = plannedBytes(props.entry);
    const stored = storedBytes(props.entry, liveProgress());
    return transferring.value && stored < planned
        ? t("downloads.page.size_of", { done: size(stored), total: size(planned) })
        : size(planned);
});

function languageName(code: string): string {
    try {
        return new Intl.DisplayNames([locale.value], { type: "language" }).of(code) ?? code;
    } catch {
        return code;
    }
}

const selectionText = computed(() => {
    const selection = props.entry.selection;
    const parts = [
        selection.kind === "audio"
            ? t("downloads.page.kind_audio")
            : t("downloads.page.kind_video"),
    ];
    if (selection.kind === "video" && selection.qualityId) parts.push(`${selection.qualityId}p`);
    if (selection.audioLanguage) parts.push(languageName(selection.audioLanguage));
    return parts.join(" · ");
});

const chapters = computed(() => chapterCount(props.entry));

// The content doc, live so one that syncs in while the page is open offers "add chapters"; a stand-in from the
// snapshot is never eligible for an add.
const stored = useDexieLiveQuery(
    (contentId: string) => db.docs.get(contentId) as Promise<ContentDto | undefined>,
    { deps: () => props.entry.content.contentId, immediate: true },
);
const eligible = service?.eligibility(() => stored.value);

const view = computed(() =>
    cardView(props.entry, service?.storage.value?.volumes ?? [], {
        canAddChapters: Boolean(service?.capabilities.sheet && eligible?.value),
    }),
);

const artwork = ref<string | undefined>(undefined);
watch(
    () => [id.value, props.entry.content.artwork] as const,
    async ([downloadId, path]) => {
        if (!service || !path) {
            artwork.value = undefined;
            return;
        }
        const url = await service.artwork(downloadId);
        if (downloadId === id.value) artwork.value = url;
    },
    { immediate: true },
);

/**
 * Opens the download wizard for this entry, as if its control had been tapped in the player: a tap on the
 * card manages the download instead of playing it. `selection` hints the wizard with what is already held.
 */
function openWizard() {
    if (props.selecting || !service) return;
    void service.openSheet(stored.value ?? contentFromSnapshot(props.entry), {
        context: "downloads",
        selection: props.entry.selection,
    });
}

// ---- actions ----------------------------------------------------------------------------------------------

const busy = ref(false);
const askingMetered = ref(false);
const confirmingRemove = ref(false);

async function run(task: () => Promise<unknown>) {
    if (busy.value) return;
    busy.value = true;
    try {
        await task();
    } finally {
        busy.value = false;
    }
}

function resume(meteredConsent: boolean) {
    void run(() => service!.resume(id.value, { meteredConsent }));
}

async function remove() {
    confirmingRemove.value = false;
    await run(async () => {
        let result;
        try {
            [result] = await service!.remove([id.value]);
        } catch {
            result = undefined;
        }
        // The engine holds no such download: nothing of it is left on the device.
        if (result?.removed || result?.code === "unknown-download") return;
        useNotificationStore().addNotification({
            title:
                result?.code === "locked"
                    ? t("downloads.page.kept_playing", { title: title.value })
                    : t("downloads.page.remove_failed", { title: title.value }),
            state: result?.code === "locked" ? "info" : "error",
            type: "toast",
            timeout: 6000,
        });
    });
}

function act(action: CardAction) {
    if (!service) return;
    switch (action) {
        case "pause":
            void run(() => service.pause(id.value));
            return;
        case "resume":
        case "retry":
            // On mobile data the viewer chooses first; the answer travels with the resume.
            if (service.network.value.metered) askingMetered.value = true;
            else resume(false);
            return;
        case "useMobileData":
            askingMetered.value = true;
            return;
        case "cancel":
            void run(() => service.cancel(id.value));
            return;
        case "fetchKey":
            void run(() => service.lifecycle.recheck());
            return;
        case "addChapters":
            void service.openSheet(stored.value ?? contentFromSnapshot(props.entry), {
                context: "downloads",
            });
            return;
        case "remove":
            confirmingRemove.value = true;
            return;
    }
}

const ACTIONS: Record<CardAction, { key: string; icon: Component }> = {
    fetchKey: { key: "downloads.page.fetch_key", icon: KeyIcon },
    useMobileData: { key: "downloads.page.use_mobile_data", icon: SignalIcon },
    resume: { key: "downloads.page.resume", icon: PlayIcon },
    retry: { key: "downloads.page.retry", icon: ArrowPathIcon },
    pause: { key: "downloads.page.pause", icon: PauseIcon },
    cancel: { key: "downloads.page.cancel", icon: StopIcon },
    addChapters: { key: "downloads.page.add_chapters", icon: PlusIcon },
    remove: { key: "downloads.page.remove", icon: TrashIcon },
};
</script>

<template>
    <article
        class="relative flex flex-col overflow-hidden rounded-lg bg-white shadow dark:bg-slate-800"
        :class="
            selecting && selected
                ? 'ring-2 ring-yellow-500 dark:ring-yellow-400'
                : 'ring-1 ring-zinc-950/10 dark:ring-white/10'
        "
        :aria-label="title"
        :data-download-id="entry.downloadId"
        :data-status="entry.status"
        data-test="download-card"
    >
        <component
            :is="selecting ? 'label' : 'button'"
            v-bind="selecting ? {} : { type: 'button' }"
            class="ease-out-expo group flex min-h-24 w-full gap-3 text-left transition"
            :class="selecting ? 'cursor-pointer' : 'hover:brightness-[1.15]'"
            data-test="download-card-open"
            @click="openWizard"
        >
            <div
                class="relative w-28 shrink-0 overflow-hidden bg-zinc-200 dark:bg-slate-700 sm:w-36"
            >
                <img
                    v-if="artwork"
                    :src="artwork"
                    alt=""
                    class="h-full w-full object-cover"
                    data-test="download-card-artwork"
                />
                <div v-else class="flex h-full w-full items-center justify-center">
                    <MusicalNoteIcon
                        v-if="entry.selection.kind === 'audio'"
                        class="h-8 w-8 text-zinc-400 dark:text-slate-500"
                        aria-hidden="true"
                    />
                    <ArrowDownTrayIcon
                        v-else
                        class="h-8 w-8 text-zinc-400 dark:text-slate-500"
                        aria-hidden="true"
                    />
                </div>
                <input
                    v-if="selecting"
                    type="checkbox"
                    class="absolute left-2 top-2 h-6 w-6 cursor-pointer appearance-none rounded-full border-2 border-white bg-white/80 shadow ring-1 ring-zinc-950/20 checked:border-yellow-500 checked:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500 dark:border-slate-300 dark:bg-slate-800/70 dark:checked:border-yellow-400 dark:checked:bg-yellow-400 dark:focus-visible:outline-yellow-400"
                    :checked="selected"
                    :aria-label="t('downloads.page.select_item', { title })"
                    data-test="download-card-select"
                    @change="emit('toggle')"
                />
                <!-- A box without the native look has no tick of its own. -->
                <CheckIcon
                    v-if="selecting && selected"
                    class="pointer-events-none absolute left-3 top-3 h-4 w-4 text-white"
                    aria-hidden="true"
                    data-test="download-card-check"
                />
            </div>

            <div class="flex min-w-0 flex-1 flex-col justify-start gap-1 py-2 pr-3">
                <h3
                    class="line-clamp-2 font-semibold leading-snug text-zinc-800 dark:text-slate-50"
                >
                    {{ title }}
                </h3>
                <p
                    class="text-xs text-zinc-500 dark:text-slate-400"
                    data-test="download-card-selection"
                >
                    {{ selectionText }}
                    <template v-if="chapters">
                        ·
                        <span data-test="download-card-chapters">{{
                            t("downloads.page.chapters", chapters)
                        }}</span>
                    </template>
                </p>
                <p
                    class="flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-slate-300"
                >
                    <span data-test="download-card-status">{{ statusText }}</span>
                    <span
                        v-if="playing"
                        class="text-yellow-700 dark:text-yellow-400"
                        data-test="download-card-playing"
                    >
                        {{ t("downloads.page.playing") }}
                    </span>
                    <span
                        class="tabular-nums text-zinc-500 dark:text-slate-400"
                        data-test="download-card-size"
                    >
                        {{ sizeText }}
                    </span>
                </p>
                <p
                    v-if="view.attention"
                    class="flex items-start gap-1 text-xs text-red-700 dark:text-red-400"
                    role="status"
                    data-test="download-card-attention"
                >
                    <ExclamationTriangleIcon
                        class="mt-px h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    {{ t(view.attention) }}
                </p>
            </div>
        </component>

        <div
            v-if="!selecting && view.actions.length"
            class="flex flex-wrap gap-2 border-t border-zinc-100 px-3 py-2 dark:border-slate-700"
            role="group"
            :aria-label="t('downloads.page.actions', { title })"
        >
            <LButton
                v-for="action in view.actions"
                :key="action"
                size="sm"
                :variant="action === 'remove' ? 'tertiary' : 'secondary'"
                :icon="ACTIONS[action].icon"
                :disabled="busy"
                :data-test="`download-card-${action}`"
                @click="act(action)"
            >
                {{ t(ACTIONS[action].key) }}
            </LButton>
        </div>

        <div
            v-if="transferring"
            class="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-zinc-200 dark:bg-slate-600"
            role="progressbar"
            :aria-label="statusText"
            :aria-valuenow="percent"
            aria-valuemin="0"
            aria-valuemax="100"
            data-test="download-card-progress"
        >
            <div class="h-full bg-yellow-500" :style="{ width: `${percent}%` }" />
        </div>

        <MeteredConfirmDialog
            v-model:open="askingMetered"
            :bytes="remainingBytes(entry, liveProgress())"
            @confirm="resume(true)"
        />
        <LDialog
            v-model:open="confirmingRemove"
            :title="t('downloads.page.remove_title')"
            :description="t('downloads.page.remove_message', { title })"
            :primary-action="remove"
            :primary-button-text="t('downloads.page.remove_confirm')"
            :secondary-action="() => (confirmingRemove = false)"
            :secondary-button-text="t('downloads.page.dialog_cancel')"
            context="danger"
        />
    </article>
</template>
