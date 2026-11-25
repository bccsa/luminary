<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowDownTrayIcon, CheckCircleIcon, TrashIcon } from "@heroicons/vue/20/solid";
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import LDialog from "@/components/common/LDialog.vue";
import ActivitySection from "@/pages/Activity/ActivitySection.vue";
import { groupByActivityDate } from "@/pages/Activity/activityGroups";
import { useShownOnceLoaded } from "@/pages/Activity/useShownOnceLoaded";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { mediaPlayerItem, mediaPlayerView } from "@/media-player/mediaPlayer";
import { useNotificationStore } from "@/stores/notification";
import { markPageReady } from "@/util/renderState";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadEntry, DownloadsService } from "@/build-time/contracts/downloads/contract";
import type { DownloadsPlayerHooks } from "../player";
import { DOWNLOAD_SORTS, freedBytes, sortDownloads, type DownloadSort } from "../page";
import { formatBytes } from "../texts";
import DownloadCard from "./DownloadCard.vue";
import ResumeBanner from "./ResumeBanner.vue";
import StorageCard from "./StorageCard.vue";

const service = inject(DownloadsKey, undefined) as
    (DownloadsService & { player: Partial<DownloadsPlayerHooks> }) | undefined;
const { t, locale } = useI18n();

const shown = useShownOnceLoaded(() => Boolean(service?.ready.value));

const sort = ref<DownloadSort>("newest");

// Reads the entries alone: a progress tick changes no entry, so it never re-renders the list.
const sorted = computed(() => sortDownloads(service?.entries.value ?? [], sort.value));
const sections = computed(() =>
    sort.value === "largest"
        ? [{ group: undefined, items: sorted.value }]
        : groupByActivityDate(sorted.value, (entry) => entry.createdAt),
);

/** The download the player is playing now, which the engine will not delete. */
const playingId = computed(() => {
    // What the viewer hears: a session an open of the same item is replacing still plays, and is still held.
    const playing = service?.player.heard?.value;
    return playing?.playbackId ? playing.downloadId : undefined;
});

// ---- selection --------------------------------------------------------------------------------------------

const selecting = ref(false);
const selected = ref<ReadonlySet<string>>(new Set());

function toggle(downloadId: string) {
    const next = new Set(selected.value);
    if (!next.delete(downloadId)) next.add(downloadId);
    selected.value = next;
}

function stopSelecting() {
    selecting.value = false;
    selected.value = new Set();
}

// A download that goes away leaves the selection with it.
watch(sorted, (entries) => {
    const ids = new Set(entries.map((e) => e.downloadId));
    if ([...selected.value].some((id) => !ids.has(id))) {
        selected.value = new Set([...selected.value].filter((id) => ids.has(id)));
    }
});

const selectedEntries = computed(() =>
    sorted.value.filter((entry) => selected.value.has(entry.downloadId)),
);
const includesPlaying = computed(() =>
    Boolean(playingId.value && selected.value.has(playingId.value)),
);
const freed = computed(() => freedBytes(selectedEntries.value, new Set()));

const size = (bytes: number) => formatBytes(bytes, locale.value);
const deleteDescription = computed(() => {
    const base = t("downloads.page.delete_message", { size: size(freed.value) });
    return includesPlaying.value ? `${base} ${t("downloads.page.delete_playing_warning")}` : base;
});
const confirming = ref(false);
const deleting = ref(false);

function notify(title: string, state: "info" | "error" = "info") {
    useNotificationStore().addNotification({ title, state, type: "toast", timeout: 6000 });
}

async function deleteSelected() {
    confirming.value = false;
    if (!service || deleting.value) return;
    const doomed: DownloadEntry[] = selectedEntries.value;
    deleting.value = true;
    try {
        const results = doomed.length
            ? await service.remove(
                  doomed.map((e) => e.downloadId),
                  { closePlaying: true },
              )
            : [];
        const total = results.reduce((sum, r) => sum + (r.removed ? r.freedBytes : 0), 0);
        const entryOf = (downloadId: string) => doomed.find((e) => e.downloadId === downloadId);
        // The engine holds no such download: nothing of it is left on the device.
        const refused = results.filter((r) => !r.removed && r.code !== "unknown-download");
        // An older native engine refuses a download being played.
        const locked = refused
            .filter((r) => r.code === "locked")
            .map((r) => entryOf(r.downloadId))
            .filter((e): e is DownloadEntry => Boolean(e));
        for (const entry of locked) {
            notify(t("downloads.page.kept_playing", { title: entry.content.title }));
        }
        for (const result of refused.filter((r) => r.code !== "locked")) {
            const title = entryOf(result.downloadId)?.content.title ?? "";
            notify(t("downloads.page.remove_failed", { title }), "error");
        }
        if (results.some((r) => r.removed)) {
            notify(t("downloads.page.deleted", { size: size(total) }));
        }
    } catch {
        notify(t("downloads.page.delete_failed"), "error");
    } finally {
        deleting.value = false;
        stopSelecting();
    }
}

// ---- selection bar placement ------------------------------------------------------------------------------

const mobileChrome = useMobileChromeAutoHide();
/** The minimised player, a floating card at the bottom right from lg up. */
const playerCard = computed(
    () => Boolean(mediaPlayerItem.value) && mediaPlayerView.value === "mini",
);

// The list keeps room for the bar, so its last card can be scrolled clear of it.
const selectionBar = ref<HTMLElement | null>(null);
const barHeight = ref(0);
let barObserver: ResizeObserver | undefined;
const measureBar = () => (barHeight.value = selectionBar.value?.offsetHeight ?? 0);
watch(selectionBar, (element, previous) => {
    if (previous) barObserver?.unobserve(previous);
    if (element) barObserver?.observe(element);
    measureBar();
});
onBeforeUnmount(() => barObserver?.disconnect());

onMounted(async () => {
    if (typeof ResizeObserver !== "undefined") barObserver = new ResizeObserver(measureBar);
    void service?.refreshStorage();
    await nextTick();
    markPageReady();
});
</script>

<template>
    <BasePage showBackButton desktopTopBar>
        <div
            class="mx-auto max-w-5xl space-y-4 px-2 pb-24"
            :style="
                selecting && barHeight
                    ? { paddingBottom: `calc(${barHeight}px + 1.5rem)` }
                    : undefined
            "
            data-test="downloads-page"
        >
            <div class="flex flex-wrap items-center justify-between gap-3">
                <h1 class="text-xl font-semibold text-zinc-900 dark:text-slate-100">
                    {{ t("downloads.title") }}
                </h1>
                <LButton
                    v-if="shown && sorted.length > 0"
                    size="sm"
                    :icon="selecting ? undefined : CheckCircleIcon"
                    :aria-pressed="selecting"
                    data-test="downloads-select"
                    @click="selecting ? stopSelecting() : (selecting = true)"
                >
                    {{ selecting ? t("downloads.page.select_done") : t("downloads.page.select") }}
                </LButton>
            </div>

            <ResumeBanner />

            <template v-if="shown">
                <div
                    v-if="sorted.length > 0"
                    class="flex flex-wrap gap-2"
                    role="radiogroup"
                    :aria-label="t('downloads.page.sort.label')"
                >
                    <button
                        v-for="order in DOWNLOAD_SORTS"
                        :key="order"
                        type="button"
                        role="radio"
                        :aria-checked="order === sort"
                        :data-test="`downloads-sort-${order}`"
                        class="rounded-full px-3 py-1 text-sm transition-colors"
                        :class="
                            order === sort
                                ? 'bg-zinc-100 text-yellow-700 ring-1 ring-yellow-700/50 dark:bg-slate-700 dark:text-yellow-400 dark:ring-yellow-400/50'
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                        "
                        @click="sort = order"
                    >
                        {{ t(`downloads.page.sort.${order}`) }}
                    </button>
                </div>

                <div
                    v-if="sorted.length === 0"
                    class="flex flex-col items-center gap-2 py-12 text-center"
                    data-test="downloads-empty"
                >
                    <ArrowDownTrayIcon
                        class="h-10 w-10 text-zinc-300 dark:text-slate-600"
                        aria-hidden="true"
                    />
                    <p class="text-zinc-500 dark:text-slate-200">{{ t("downloads.page.empty") }}</p>
                    <p class="text-sm text-zinc-400 dark:text-slate-400">
                        {{ t("downloads.page.empty_hint") }}
                    </p>
                </div>

                <div v-else data-test="downloads-list">
                    <template v-for="section in sections" :key="section.group ?? 'all'">
                        <ActivitySection v-if="section.group" :group="section.group">
                            <div
                                class="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3"
                            >
                                <DownloadCard
                                    v-for="entry in section.items"
                                    :key="entry.downloadId"
                                    :entry="entry"
                                    :selecting="selecting"
                                    :selected="selected.has(entry.downloadId)"
                                    :playing="entry.downloadId === playingId"
                                    @toggle="toggle(entry.downloadId)"
                                />
                            </div>
                        </ActivitySection>
                        <div
                            v-else
                            class="mb-6 grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3"
                        >
                            <DownloadCard
                                v-for="entry in section.items"
                                :key="entry.downloadId"
                                :entry="entry"
                                :selecting="selecting"
                                :selected="selected.has(entry.downloadId)"
                                :playing="entry.downloadId === playingId"
                                @toggle="toggle(entry.downloadId)"
                            />
                        </div>
                    </template>
                </div>
            </template>

            <StorageCard />
        </div>

        <!-- Phones: rides above the menu and the minimised player, moving with them as they step aside on scroll.
             From lg up there is no menu: it sits at the foot, clear of the safe area and the player's card. -->
        <div
            v-if="selecting"
            ref="selectionBar"
            class="fixed inset-x-0 bottom-[calc(var(--mobile-menu-h,0px)+var(--media-bar-h,0px))] z-40 border-t border-zinc-200 bg-white px-4 py-3 shadow-lg transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform after:absolute after:inset-x-0 after:top-full after:h-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))] after:bg-white after:content-[''] dark:border-slate-700 dark:bg-slate-900 dark:after:bg-slate-900 lg:bottom-0 lg:translate-y-0 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:after:hidden"
            :class="[
                mobileChrome.hidden.value
                    ? 'translate-y-[calc(var(--mobile-menu-h,0px)-max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px)))]'
                    : 'translate-y-0',
                playerCard ? 'lg:pr-[26.5rem]' : '',
            ]"
            :data-chrome-hidden="mobileChrome.hidden.value"
            role="region"
            :aria-label="t('downloads.page.selection')"
            data-test="downloads-selection-bar"
        >
            <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1 text-sm" aria-live="polite">
                    <p class="font-medium text-zinc-900 dark:text-slate-100">
                        {{ t("downloads.page.selected", { count: selected.size }) }}
                        <span
                            v-if="selectedEntries.length"
                            class="font-normal text-zinc-500 dark:text-slate-400"
                            data-test="downloads-selection-frees"
                        >
                            · {{ t("downloads.page.frees", { size: size(freed) }) }}
                        </span>
                    </p>
                </div>
                <LButton
                    variant="danger"
                    size="sm"
                    :icon="TrashIcon"
                    :disabled="selectedEntries.length === 0 || deleting"
                    data-test="downloads-delete-selected"
                    @click="confirming = true"
                >
                    {{ t("downloads.page.delete_selected") }}
                </LButton>
            </div>
        </div>

        <LDialog
            v-model:open="confirming"
            :title="t('downloads.page.delete_title')"
            :description="deleteDescription"
            :primary-action="deleteSelected"
            :primary-button-text="t('downloads.page.delete_selected')"
            :secondary-action="() => (confirming = false)"
            :secondary-button-text="t('downloads.page.dialog_cancel')"
            context="danger"
        />
    </BasePage>
</template>
