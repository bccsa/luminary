<script setup lang="ts">
import { computed, ref } from "vue";
import type { FakeEngine } from "../fakeEngine";
import { selectionKey } from "../fakeEngine";

// Development only: stands in for the platform's download sheet and the device's edge cases.
const props = defineProps<{ engine: FakeEngine }>();

const collapsed = ref(false);
const sheet = computed(() => props.engine.sheet.value);
const model = computed(() => sheet.value?.model);
const selectable = computed(
    () =>
        model.value?.chapters
            .map((chapter, index) => ({ chapter, index }))
            .filter(({ chapter }) => chapter.state === "none")
            .map(({ index }) => index) ?? [],
);
const firstDownload = computed(() => {
    const id = model.value?.existing[0]?.downloadId;
    return id ? [id] : [];
});

function start(meteredConsent: boolean, volumeId?: string) {
    if (!model.value) return;
    props.engine.act({
        action: "start",
        selection: model.value.selection,
        chapters: model.value.sparsePlayback ? selectable.value : [],
        meteredConsent,
        ...(volumeId ? { volumeId } : {}),
    });
}

/** Chapters toggled in the panel: a stored one is removed by Update, a new one added. */
const toggled = ref(new Set<number>());
function toggle(index: number) {
    const next = new Set(toggled.value);
    if (!next.delete(index)) next.add(index);
    toggled.value = next;
}
function update() {
    const chapters = model.value?.chapters ?? [];
    const picked = [...toggled.value];
    props.engine.act({
        action: "update",
        add: picked.filter((i) => chapters[i]?.state === "none"),
        remove: picked.filter((i) => chapters[i] && chapters[i].state !== "none"),
        meteredConsent: metered.value,
    });
    toggled.value = new Set();
}

const online = ref(true);
const metered = ref(false);
const cardMounted = ref(true);
function toggleNetwork() {
    online.value = !online.value;
    props.engine.setNetwork({ online: online.value });
}
function toggleMetered() {
    metered.value = !metered.value;
    props.engine.setNetwork({ metered: metered.value });
}
function toggleCard() {
    cardMounted.value = !cardMounted.value;
    props.engine.setMounted("card-1", cardMounted.value);
}
</script>

<template>
    <div
        class="fixed bottom-20 right-2 z-[9999] w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-white/95 p-3 text-xs text-zinc-900 shadow-xl ring-1 ring-zinc-300 dark:bg-slate-800/95 dark:text-slate-100 dark:ring-slate-600"
        data-test="fake-downloads-panel"
    >
        <div class="flex items-center justify-between gap-2">
            <strong>Fake downloads</strong>
            <button type="button" class="underline" @click="collapsed = !collapsed">
                {{ collapsed ? "Show" : "Hide" }}
            </button>
        </div>
        <template v-if="!collapsed">
            <div class="mt-2 flex flex-wrap gap-1">
                <button
                    type="button"
                    class="rounded bg-zinc-200 px-2 py-0.5 dark:bg-slate-600"
                    @click="engine.tick()"
                >
                    Tick
                </button>
                <button
                    type="button"
                    class="rounded bg-zinc-200 px-2 py-0.5 dark:bg-slate-600"
                    @click="toggleNetwork"
                >
                    {{ online ? "Go offline" : "Go online" }}
                </button>
                <button
                    type="button"
                    class="rounded bg-zinc-200 px-2 py-0.5 dark:bg-slate-600"
                    @click="toggleMetered"
                >
                    {{ metered ? "Wi-Fi" : "Mobile data" }}
                </button>
                <button
                    type="button"
                    class="rounded bg-zinc-200 px-2 py-0.5 dark:bg-slate-600"
                    @click="toggleCard"
                >
                    {{ cardMounted ? "Remove card" : "Insert card" }}
                </button>
                <button
                    type="button"
                    class="rounded bg-zinc-200 px-2 py-0.5 dark:bg-slate-600"
                    @click="engine.deferNextCheck()"
                >
                    Defer next check
                </button>
            </div>
            <div
                v-if="model"
                class="mt-3 space-y-1 border-t border-zinc-200 pt-2 dark:border-slate-600"
            >
                <p>
                    <strong>{{ model.title }}</strong> · {{ model.phase }}
                    <span v-if="model.locked">· locked</span>
                </p>
                <p v-if="model.message">{{ model.message }}</p>
                <p>Selection: {{ selectionKey(model.selection) }}</p>
                <p v-if="model.download">
                    Download: {{ model.download.status }}
                    <span v-if="model.download.reason">({{ model.download.reason }})</span>
                    {{ Math.round(model.download.progress * 100) }}%
                </p>
                <p v-if="model.source">
                    Source: {{ model.source.current }} (downloaded
                    {{ model.source.canDownloaded ? "yes" : "no" }}, online
                    {{ model.source.canOnline ? "yes" : "no" }})
                </p>
                <ul class="pl-3">
                    <li v-for="(chapter, index) in model.chapters" :key="chapter.startTime">
                        <label>
                            <input
                                type="checkbox"
                                :checked="toggled.has(index)"
                                @change="toggle(index)"
                            />
                            {{ chapter.title }}: {{ chapter.state }}
                        </label>
                    </li>
                </ul>
                <div class="flex flex-wrap gap-1 pt-1">
                    <button
                        v-for="button in [
                            { label: 'Start', run: () => start(false) },
                            { label: 'Start (mobile data)', run: () => start(true) },
                            { label: 'Start on SD card', run: () => start(false, 'card-1') },
                            { label: 'Update (toggled)', run: update },
                            { label: 'Pause', run: () => engine.act({ action: 'pause' }) },
                            {
                                label: 'Resume',
                                run: () =>
                                    engine.act({ action: 'resume', meteredConsent: metered }),
                            },
                            { label: 'Remove', run: () => engine.act({ action: 'remove' }) },
                            {
                                label: 'Online',
                                run: () => engine.act({ action: 'source', value: 'online' }),
                            },
                            {
                                label: 'Downloaded',
                                run: () => engine.act({ action: 'source', value: 'downloaded' }),
                            },
                            {
                                label: 'Delete oldest',
                                run: () =>
                                    engine.act({ action: 'delete', downloadIds: firstDownload }),
                            },
                            { label: 'Clean up', run: () => engine.act({ action: 'cleanUp' }) },
                            { label: 'Retry', run: () => engine.act({ action: 'retry' }) },
                            { label: 'Close', run: () => engine.act({ action: 'dismissed' }) },
                        ]"
                        :key="button.label"
                        type="button"
                        class="rounded bg-yellow-400 px-2 py-0.5 text-yellow-950"
                        @click="button.run"
                    >
                        {{ button.label }}
                    </button>
                </div>
            </div>
            <p v-else class="mt-2 text-zinc-500 dark:text-slate-400">No sheet open.</p>
        </template>
    </div>
</template>
