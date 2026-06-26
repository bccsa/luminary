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
    normalizeSyncedLanguages,
} from "@/globalConfig";
import LModal from "../form/LModal.vue";
import { ArrowDownIcon, ArrowUpIcon, XMarkIcon } from "@heroicons/vue/24/solid";
import { PlusCircleIcon } from "@heroicons/vue/24/outline";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import { useNotificationStore } from "@/stores/notification";

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

// ── Draft mutations: order ──
const addLanguage = (id: string) => {
    if (draftOrder.value.includes(id)) return;
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
const removeFromSelected = (id: string) => {
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
        // Ticking ON = mark for download → only happens once online.
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
    const orderChanged = !orderEquals(draftOrder.value, appLanguageIdsAsRef.value);
    const previousSynced = [...appSyncedLanguageIdsAsRef.value];
    // Commit both atomically: one re-sync + one display rebuild at most.
    appLanguageIdsAsRef.value = [...draftOrder.value];
    appSyncedLanguageIdsAsRef.value = normalizeSyncedLanguages(draftSynced.value, draftOrder.value);

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
            class="divide-y divide-zinc-200 dark:divide-slate-600"
            enter-active-class="transition duration-100 ease-in-out"
            enter-from-class="opacity-0 transform -translate-y-2"
            enter-to-class="opacity-100 transform translate-y-0"
            leave-active-class="transition duration-100 ease-in-out"
            leave-from-class="opacity-100 transform translate-y-0"
            leave-to-class="opacity-0 transform translate-y-2"
            move-class="transition duration-100 ease-in-out"
        >
            <div
                v-for="language in languagesSelected"
                :id="language._id"
                :key="language._id"
                class="flex w-full items-center gap-3 p-3"
            >
                <input
                    type="checkbox"
                    :checked="isOfflineChecked(language._id)"
                    :disabled="language._id === primaryId"
                    :title="
                        language._id === primaryId
                            ? t('language.modal.primaryAlwaysOffline')
                            : t('language.modal.availableOffline')
                    "
                    :aria-label="t('language.modal.availableOffline')"
                    data-test="offline-checkbox"
                    class="h-4 w-4 cursor-pointer rounded border-zinc-300 text-yellow-500 focus:ring-yellow-500 disabled:cursor-auto disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700"
                    @change="toggleSynced(language._id)"
                />

                <span class="flex-1 text-sm">{{ language.name }}</span>

                <div class="flex items-center gap-2">
                    <button
                        v-if="language._id !== draftOrder[0]"
                        type="button"
                        data-test="increase-priority"
                        @click="increasePriority(language._id)"
                        class="flex cursor-pointer items-center rounded-full px-1 hover:text-yellow-600 dark:hover:text-yellow-500"
                    >
                        <ArrowUpIcon class="h-6 w-6" />
                    </button>
                    <button
                        v-if="language._id !== draftOrder[draftOrder.length - 1]"
                        type="button"
                        data-test="decrease-priority"
                        @click="decreasePriority(language._id)"
                        class="flex cursor-pointer items-center rounded-full px-1 hover:text-yellow-600 dark:hover:text-yellow-500"
                    >
                        <ArrowDownIcon class="h-6 w-6" />
                    </button>
                    <button
                        type="button"
                        data-test="remove-language-button"
                        @click="removeFromSelected(language._id)"
                        class="flex cursor-pointer items-center rounded-full px-1 text-zinc-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-500"
                    >
                        <XMarkIcon class="h-6 w-6" />
                    </button>
                </div>
            </div>
        </transition-group>

        <p class="px-3 py-2 text-xs text-zinc-500 dark:text-slate-400">
            {{ t("language.modal.offlineCaption") }}
        </p>

        <div class="divide-y divide-zinc-200 dark:divide-slate-600">
            <div
                v-for="language in availableLanguages"
                :id="language._id"
                :key="language._id"
                class="flex w-full cursor-pointer items-center gap-1 p-3"
                data-test="add-language-button"
                @click="addLanguage(language._id)"
            >
                <PlusCircleIcon
                    class="h-5 w-5 cursor-pointer text-zinc-500 hover:text-yellow-600 dark:text-slate-400 dark:hover:text-yellow-500"
                />
                <span class="text-sm">{{ language.name }}</span>
            </div>
        </div>

        <template #footer>
            <div class="flex w-full gap-2">
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
