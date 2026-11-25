<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { SparklesIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import { useNotificationStore } from "@/stores/notification";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadVolume } from "@/build-time/contracts/downloads/contract";
import { formatBytes } from "../texts";

const service = inject(DownloadsKey, undefined);
const { t, locale } = useI18n();

const storage = computed(() => service?.storage.value ?? null);
const mounted = computed(() => storage.value?.volumes.filter((v) => v.mounted) ?? []);

/** Where new downloads go: the preferred volume while it is mounted, else internal storage. */
const target = computed(() => {
    const volumes = storage.value?.volumes ?? [];
    const preferred = volumes.find((v) => v.id === storage.value?.preferredVolumeId);
    return preferred?.mounted ? preferred : volumes.find((v) => v.id === "internal");
});

const sum = (pick: (v: DownloadVolume) => number) =>
    mounted.value.reduce((total, volume) => total + pick(volume), 0);
const used = computed(() => sum((v) => v.downloadsBytes));
const reclaimable = computed(() =>
    sum(
        (v) =>
            v.reclaimable.orphans +
            v.reclaimable.staging +
            v.reclaimable.unreferenced +
            v.reclaimable.expired,
    ),
);

/** The switch appears only when there is a card to choose. */
const showLocation = computed(
    () => Boolean(service?.capabilities.volumes) && mounted.value.some((v) => v.kind === "card"),
);

const size = (bytes: number) => formatBytes(bytes, locale.value);
const volumeName = (volume: DownloadVolume) =>
    volume.kind === "internal"
        ? t("downloads.storage.internal")
        : volume.label || t("downloads.storage.card");

const cleaning = ref(false);
async function cleanUp() {
    if (!service || cleaning.value) return;
    cleaning.value = true;
    try {
        const freed = await service.cleanUp();
        useNotificationStore().addNotification({
            title:
                freed > 0
                    ? t("downloads.storage.cleaned", { size: size(freed) })
                    : t("downloads.storage.nothing_to_clean"),
            state: freed > 0 ? "success" : "info",
            type: "toast",
            timeout: 4000,
        });
    } catch {
        useNotificationStore().addNotification({
            title: t("downloads.storage.clean_up_failed"),
            state: "error",
            type: "toast",
            timeout: 6000,
        });
    } finally {
        cleaning.value = false;
    }
}

const pending = ref<string | null>(null);
const selectedId = computed(() => pending.value ?? target.value?.id);

async function choose(volumeId: string) {
    if (!service || pending.value || volumeId === selectedId.value) return;
    pending.value = volumeId;
    try {
        const ok = await service.setPreferredVolume(volumeId);
        if (!ok) {
            useNotificationStore().addNotification({
                title: t("downloads.storage.location_failed"),
                state: "error",
                type: "toast",
                timeout: 6000,
            });
        }
    } finally {
        pending.value = null;
    }
}
</script>

<template>
    <section
        v-if="service && storage"
        class="rounded-lg bg-white p-4 shadow ring-1 ring-zinc-950/10 dark:bg-slate-800 dark:ring-white/10"
        :aria-label="t('downloads.storage.title')"
        data-test="downloads-storage"
    >
        <h2
            class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400"
        >
            {{ t("downloads.storage.title") }}
        </h2>
        <dl class="grid grid-cols-3 gap-2 text-sm">
            <div>
                <dt class="text-xs text-zinc-500 dark:text-slate-400">
                    {{ t("downloads.storage.used") }}
                </dt>
                <dd
                    class="font-medium tabular-nums text-zinc-900 dark:text-slate-100"
                    data-test="downloads-storage-used"
                >
                    {{ size(used) }}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-zinc-500 dark:text-slate-400">
                    {{ t("downloads.storage.free") }}
                </dt>
                <dd
                    class="font-medium tabular-nums text-zinc-900 dark:text-slate-100"
                    data-test="downloads-storage-free"
                >
                    {{ size(target?.freeBytes ?? 0) }}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-zinc-500 dark:text-slate-400">
                    {{ t("downloads.storage.reclaimable") }}
                </dt>
                <dd
                    class="font-medium tabular-nums text-zinc-900 dark:text-slate-100"
                    data-test="downloads-storage-reclaimable"
                >
                    {{ size(reclaimable) }}
                </dd>
            </div>
        </dl>
        <LButton
            class="mt-3"
            size="sm"
            :icon="SparklesIcon"
            :disabled="cleaning"
            data-test="downloads-clean-up"
            @click="cleanUp"
        >
            {{ cleaning ? t("downloads.storage.cleaning") : t("downloads.storage.clean_up") }}
        </LButton>

        <fieldset
            v-if="showLocation"
            class="mt-4 border-t border-zinc-200 pt-3 dark:border-slate-600"
            data-test="downloads-location"
        >
            <legend class="pt-3 text-sm font-medium text-zinc-900 dark:text-slate-100">
                {{ t("downloads.storage.location") }}
            </legend>
            <div class="mt-2 flex flex-wrap gap-2" role="radiogroup">
                <label
                    v-for="volume in mounted"
                    :key="volume.id"
                    class="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-yellow-500"
                    :class="
                        volume.id === selectedId
                            ? 'bg-zinc-100 text-yellow-700 ring-yellow-700/50 dark:bg-slate-700 dark:text-yellow-400 dark:ring-yellow-400/50'
                            : 'bg-zinc-100 text-zinc-700 ring-transparent hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    "
                    :data-test="`downloads-location-${volume.id}`"
                >
                    <input
                        type="radio"
                        class="sr-only"
                        name="downloads-location"
                        :value="volume.id"
                        :checked="volume.id === selectedId"
                        @change="choose(volume.id)"
                    />
                    {{ volumeName(volume) }}
                    <span class="text-xs text-zinc-500 dark:text-slate-400">
                        {{ t("downloads.storage.free_on", { size: size(volume.freeBytes) }) }}
                    </span>
                </label>
            </div>
            <p class="mt-2 text-xs text-zinc-500 dark:text-slate-400">
                {{ t("downloads.storage.location_hint") }}
            </p>
        </fieldset>
    </section>
</template>
