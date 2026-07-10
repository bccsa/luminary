<script setup lang="ts">
import {
    DocType,
    isConnected,
    type LanguageDto,
    pruneUnsyncedLanguageContent,
    useHybridQuery,
} from "luminary-shared";
import LButton from "../button/LButton.vue";
import {
    appLanguageIdsAsRef,
    appSyncedLanguageIdsAsRef,
    MAX_PREFERRED_LANGUAGES,
    normalizePreferredLanguages,
    normalizeSyncedLanguages,
} from "@/globalConfig";
import LModal from "../form/LModal.vue";
import DragHandleIcon from "../icons/DragHandleIcon.vue";
import { ArrowDownTrayIcon, CheckIcon, XMarkIcon } from "@heroicons/vue/24/solid";
import { InformationCircleIcon, PlusCircleIcon } from "@heroicons/vue/24/outline";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import { useNotificationStore } from "@/stores/notification";
import { useDragReorder } from "@/composables/useDragReorder";

import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

type Props = {
    isVisible: boolean;
};
const props = defineProps<Props>();

const { t } = useI18n();
const { addNotification } = useNotificationStore();

// Offline, sync can't download a newly-added language, and removing / un-downloading a language
// would prune its local content with no way to re-fetch it. So while offline: adding is allowed but
// flagged as deferred, and clearing (remove / un-download) is blocked. Stable ids dedupe the toasts.
const notifyAddDeferred = () =>
    addNotification({
        id: "lang-offline-add",
        title: t("language.modal.offline.add.title"),
        description: t("language.modal.offline.add.description"),
        state: "info",
        type: "toast",
    });
const notifyClearBlocked = () =>
    addNotification({
        id: "lang-offline-clear",
        title: t("language.modal.offline.clear.title"),
        description: t("language.modal.offline.clear.description"),
        state: "error",
        type: "toast",
    });

// Language is a fully-synced type, so HybridQuery reads from IndexedDB only. Only the i18n
// singleton needs `translations`; the modal reads just id/name, so drop the heavy strings map.
const languages = useHybridQuery<LanguageDto>(() => ({ selector: { type: DocType.Language } }), {
    live: true,
    stripFields: ["translations", "_rev"],
});

const emit = defineEmits(["close"]);

// ── Draft state ──────────────────────────────────────────────────────────────
// All edits (reorder / add / remove / offline-tick) are staged here and committed only on Save,
// so the modal never triggers a content re-sync or display rebuild while the user is still
// adjusting. `draftOrder` is the preferred display order; `draftSynced` is the "available
// offline" (downloaded) subset.
const draftOrder = ref<string[]>([...appLanguageIdsAsRef.value]);
const draftSynced = ref<string[]>([...appSyncedLanguageIdsAsRef.value]);

// Re-seed the drafts from the committed state whenever the modal (re)opens.
watch(
    () => props.isVisible,
    (visible) => {
        if (!visible) return;
        draftOrder.value = [...appLanguageIdsAsRef.value];
        draftSynced.value = [...appSyncedLanguageIdsAsRef.value];
    },
);

// The primary (first preferred) language is always synced and cannot be un-ticked.
const primaryId = computed(() => draftOrder.value[0]);

const languagesSelected = computed(
    () =>
        draftOrder.value
            .map((id) => languages.value.find((lang) => lang._id === id))
            .filter(Boolean) as LanguageDto[],
);

const availableLanguages = computed(() =>
    languages.value
        .filter((lang) => !draftOrder.value.includes(lang._id))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

// A user may prefer at most MAX_PREFERRED_LANGUAGES; the add list is hidden once at the cap.
const canAddMore = computed(() => draftOrder.value.length < MAX_PREFERRED_LANGUAGES);

// ── Draft mutations: order ──
const addLanguage = (id: string) => {
    if (draftOrder.value.includes(id)) return;
    if (draftOrder.value.length >= MAX_PREFERRED_LANGUAGES) return; // cap the preferred set
    draftOrder.value.push(id);
    if (!isConnected.value) notifyAddDeferred(); // its content can only download once online
};
const increasePriority = (id: string) => {
    const i = draftOrder.value.indexOf(id);
    if (i > 0) {
        [draftOrder.value[i - 1], draftOrder.value[i]] = [
            draftOrder.value[i],
            draftOrder.value[i - 1],
        ];
    }
};
const decreasePriority = (id: string) => {
    const i = draftOrder.value.indexOf(id);
    if (i !== -1 && i < draftOrder.value.length - 1) {
        [draftOrder.value[i + 1], draftOrder.value[i]] = [
            draftOrder.value[i],
            draftOrder.value[i + 1],
        ];
    }
};

// ── Drag-to-reorder ──────────────────────────────────────────────────────────
const { draggingId, dragTranslate, startDrag, onDragMove, endDrag } = useDragReorder(draftOrder);

// Keyboard equivalent of the drag: the handle is focusable and arrow keys nudge the row.
const onHandleKeydown = (id: string, e: KeyboardEvent) => {
    if (e.key === "ArrowUp") {
        e.preventDefault();
        increasePriority(id);
    } else if (e.key === "ArrowDown") {
        e.preventDefault();
        decreasePriority(id);
    }
};

const removeFromSelected = (id: string) => {
    // At least one preferred language must remain — empty order breaks sync + offline content.
    if (draftOrder.value.length <= 1) return;
    // Block offline ONLY for a language whose content is actually downloaded (in the committed
    // synced set) — removing it prunes content that can't be re-fetched offline. A language added
    // (or ticked) while offline has nothing downloaded yet, so it can be removed freely.
    if (!isConnected.value && appSyncedLanguageIdsAsRef.value.includes(id)) {
        return notifyClearBlocked();
    }
    const i = draftOrder.value.indexOf(id);
    if (i !== -1) draftOrder.value.splice(i, 1);
    const si = draftSynced.value.indexOf(id);
    if (si !== -1) draftSynced.value.splice(si, 1);
};

// ── Draft mutations: offline (synced) subset ──
const isSynced = (id: string) => draftSynced.value.includes(id);
// The displayed checkbox state: ticked, OR the primary (always synced → always shown ticked).
// We deliberately do NOT add the primary to `draftSynced` here, so demoting a language that was
// only "ticked by virtue of being primary" reverts it to its previous (un-ticked) state. The
// primary is force-included into the committed synced set by `normalizeSyncedLanguages` on Save.
const isOfflineChecked = (id: string) => id === primaryId.value || isSynced(id);
const toggleSynced = (id: string) => {
    if (id === primaryId.value) return; // primary is always synced
    const i = draftSynced.value.indexOf(id);
    if (i === -1) {
        // Ticking ON = mark for download → only happens once online. The synced set can't exceed the
        // preferred cap: only preferred (draftOrder) languages are toggleable and each is added once.
        draftSynced.value.push(id);
        if (!isConnected.value) notifyAddDeferred();
    } else {
        // Un-ticking = stop downloading = clear its local content. Block offline ONLY if it was
        // actually downloaded (committed synced); un-ticking a language ticked this session (not yet
        // downloaded) clears nothing, so allow it.
        if (!isConnected.value && appSyncedLanguageIdsAsRef.value.includes(id)) {
            return notifyClearBlocked();
        }
        draftSynced.value.splice(i, 1);
    }
};

// ── Commit / discard ──
const orderEquals = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);

const save = () => {
    if (draftOrder.value.length === 0) return;
    // Cap the preferred order defensively (the UI already blocks going over) before committing.
    const nextOrder = normalizePreferredLanguages(draftOrder.value);
    const orderChanged = !orderEquals(nextOrder, appLanguageIdsAsRef.value);
    const previousSynced = [...appSyncedLanguageIdsAsRef.value];
    // Commit both atomically: one re-sync + one display rebuild at most.
    appLanguageIdsAsRef.value = nextOrder;
    appSyncedLanguageIdsAsRef.value = normalizeSyncedLanguages(draftSynced.value, nextOrder);

    // Clean up content for languages no longer synced (un-ticked). Recently-served / pinned docs
    // survive (retention-gated); the rest degrade to fetch-on-demand. Fire-and-forget. Only while
    // ONLINE — pruning offline would delete content that can't be re-fetched (clearing is also
    // blocked in the handlers above, so `removed` is normally empty offline; this is belt-and-braces).
    const removed = previousSynced.filter((id) => !appSyncedLanguageIdsAsRef.value.includes(id));
    if (removed.length && isConnected.value) void pruneUnsyncedLanguageContent(removed);

    if (orderChanged) markLanguageSwitch();
    emit("close");
};

// Discard: drafts are re-seeded from the committed state on the next open.
const cancel = () => emit("close");
</script>

<template>
    <LModal
        name="lModal-languages"
        class="flex flex-col"
        :heading="t('language.modal.title')"
        :is-visible="isVisible"
        @close="cancel"
    >
        <transition-group
            name="language"
            tag="div"
            :class="['flex flex-col gap-2', draggingId && 'select-none']"
            enter-active-class="transition duration-100 ease-in-out"
            enter-from-class="opacity-0 transform -translate-y-2"
            enter-to-class="opacity-100 transform translate-y-0"
            leave-active-class="transition duration-100 ease-in-out"
            leave-from-class="opacity-100 transform translate-y-0"
            leave-to-class="opacity-0 transform translate-y-2"
            :move-class="draggingId ? 'transition-none' : 'transition duration-100 ease-in-out'"
        >
            <!-- Row = [segmented bar] ×. The bar is [grip | language | offline toggle]; the toggle's
                 own fill is what separates it, no divider lines needed. Remove sits OUTSIDE the bar
                 at the trailing edge: it is destructive, so it stays as far as possible from the
                 grip you press-and-hold, and the toggle keeps the bar's rounded right edge.
                 `move-class` is disabled while dragging: TransitionGroup's FLIP writes to
                 `transform`, which would fight the grabbed row's own translate. -->
            <div
                v-for="language in languagesSelected"
                :id="language._id"
                :key="language._id"
                data-lang-row
                :class="[
                    'flex w-full items-center gap-1',
                    draggingId === language._id && 'relative z-10',
                ]"
                :style="
                    draggingId === language._id
                        ? { transform: `translateY(${dragTranslate}px)` }
                        : undefined
                "
            >
                <div
                    :class="[
                        'flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl bg-zinc-50 ring-1 ring-zinc-200 dark:bg-slate-600/30 dark:ring-slate-500/50',
                        draggingId === language._id &&
                            'shadow-lg ring-yellow-500 dark:ring-yellow-500',
                    ]"
                >
                    <!-- Grab handle: `touch-none` stops the browser claiming the gesture as a scroll. -->
                    <button
                        v-if="draftOrder.length > 1"
                        type="button"
                        data-test="drag-handle"
                        :aria-label="t('language.modal.reorder')"
                        :title="t('language.modal.reorder')"
                        class="flex shrink-0 cursor-grab touch-none items-center py-2 pl-2 pr-1 text-zinc-400 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-500 active:cursor-grabbing dark:text-slate-400 dark:hover:text-slate-200"
                        @pointerdown="startDrag(language._id, $event)"
                        @pointermove="onDragMove"
                        @pointerup="endDrag"
                        @pointercancel="endDrag"
                        @lostpointercapture="endDrag"
                        @keydown="onHandleKeydown(language._id, $event)"
                    >
                        <DragHandleIcon class="h-4 w-4" />
                    </button>

                    <div class="flex min-w-0 flex-1 items-center px-3 py-2">
                        <span class="truncate text-sm font-semibold">{{ language.name }}</span>
                    </div>

                    <!-- Offline toggle: the right segment fills yellow when the language is synced
                         offline. A real checkbox fills the segment and drives state (a11y + tests
                         unchanged). -->
                    <label
                        class="relative flex shrink-0 cursor-pointer items-center px-3"
                        :title="
                            language._id === primaryId
                                ? t('language.modal.primaryAlwaysOffline')
                                : t('language.modal.availableOffline')
                        "
                    >
                        <input
                            type="checkbox"
                            :checked="isOfflineChecked(language._id)"
                            :disabled="language._id === primaryId"
                            :aria-label="t('language.modal.availableOffline')"
                            data-test="offline-checkbox"
                            class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent checked:bg-yellow-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-600 disabled:cursor-auto dark:checked:bg-yellow-500"
                            @change="toggleSynced(language._id)"
                        />
                        <component
                            :is="isOfflineChecked(language._id) ? CheckIcon : ArrowDownTrayIcon"
                            class="pointer-events-none relative h-4 w-4 text-zinc-500 peer-checked:text-yellow-950 dark:text-slate-300"
                        />
                    </label>
                </div>

                <button
                    v-if="draftOrder.length > 1"
                    type="button"
                    data-test="remove-language-button"
                    :aria-label="t('language.modal.remove')"
                    :title="t('language.modal.remove')"
                    @click="removeFromSelected(language._id)"
                    class="flex shrink-0 cursor-pointer items-center rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-red-500"
                >
                    <XMarkIcon class="h-4 w-4" />
                </button>
            </div>
        </transition-group>

        <p
            class="mt-2 flex items-center gap-1.5 border-t border-zinc-200 px-3 pb-1 pt-3 text-xs text-zinc-500 dark:border-slate-600 dark:text-slate-400"
        >
            <InformationCircleIcon class="h-4 w-4 shrink-0" />
            {{ t("language.modal.offlineCaption") }}
        </p>

        <div
            v-if="canAddMore"
            class="mt-1 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-slate-600"
        >
            <div
                v-for="language in availableLanguages"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-zinc-500 transition-colors hover:border-yellow-400 hover:bg-yellow-50 hover:text-yellow-700 dark:border-slate-500 dark:text-slate-400 dark:hover:border-yellow-500/60 dark:hover:bg-slate-600 dark:hover:text-yellow-500"
                data-test="add-language-button"
                @click="addLanguage(language._id)"
            >
                <PlusCircleIcon class="h-5 w-5 shrink-0" />
                <span class="text-sm font-medium">{{ language.name }}</span>
            </div>
        </div>

        <template #footer>
            <div class="flex w-full flex-col gap-2 sm:flex-row">
                <LButton
                    variant="secondary"
                    size="lg"
                    rounding="less"
                    class="w-full"
                    data-test="cancel-languages"
                    @click="cancel"
                >
                    {{ t("language.modal.cancel") }}
                </LButton>
                <LButton
                    variant="primary"
                    size="lg"
                    rounding="less"
                    class="w-full"
                    data-test="save-languages"
                    @click="save"
                >
                    {{ t("language.modal.save") }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
