<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted } from "vue";
import {
    type ContentParentDto,
    type LanguageDto,
    DocType,
    useSharedHybridQuery,
} from "luminary-shared";
import { PlayIcon, PauseIcon, MusicalNoteIcon } from "@heroicons/vue/20/solid";
import LBadge from "../common/LBadge.vue";

/**
 * Audio already attached to this document, per language.
 *
 * Read-only: nothing adds audio from the CMS any more, and the app still plays
 * what is here — `addToMediaQueue` reads these collections — so an editor needs to
 * see what a reader hears even though they cannot change it.
 */
type Props = {
    parent?: ContentParentDto;
};
const props = defineProps<Props>();

const baseUrl: string = import.meta.env.VITE_CLIENT_IMAGES_URL;

const allLanguages = useSharedHybridQuery<LanguageDto>(
    () => ({ selector: { type: DocType.Language } }),
    { live: true },
);

const toAbsolute = (url: string) => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${baseUrl}/${url}`.replace(/([^:]\/)(\/)+/g, "$1");
};

/** One row per collection, named by its language and sorted the way the CMS lists languages. */
const tracks = computed(() =>
    (props.parent?.media?.fileCollections ?? [])
        .map((collection) => {
            const language = allLanguages.value.find((l) => l._id === collection.languageId);
            return {
                key: collection.fileUrl,
                src: toAbsolute(collection.fileUrl || ""),
                name: language?.name ?? "Unknown language",
                code: language?.languageCode ?? "",
            };
        })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

const playingKey = ref<string>();
const failed = ref<Record<string, boolean>>({});
const players = ref<Record<string, HTMLAudioElement | undefined>>({});

// Only one track plays at a time, across every list on the page.
const GLOBAL_EVENT = "cms-audio-thumbnail-play";

const stop = (key: string) => {
    const el = players.value[key];
    if (el) {
        el.pause();
        el.currentTime = 0;
    }
    if (playingKey.value == key) playingKey.value = undefined;
};

const toggle = (key: string) => {
    if (playingKey.value == key) return stop(key);

    if (playingKey.value) stop(playingKey.value);

    const el = players.value[key];
    if (!el) return;

    window.dispatchEvent(new CustomEvent(GLOBAL_EVENT, { detail: el }));
    el.play()
        .then(() => (playingKey.value = key))
        .catch(() => (playingKey.value = undefined));
};

const onGlobalPlay = (event: Event) => {
    const started = (event as CustomEvent<HTMLAudioElement>).detail;
    if (playingKey.value && players.value[playingKey.value] !== started) stop(playingKey.value);
};

onMounted(() => window.addEventListener(GLOBAL_EVENT, onGlobalPlay));
onBeforeUnmount(() => window.removeEventListener(GLOBAL_EVENT, onGlobalPlay));
</script>

<template>
    <div v-if="tracks.length" data-test="audio-list">
        <div class="flex flex-col">
            <div
                v-for="track in tracks"
                :key="track.key"
                class="flex items-center gap-2.5 border-t border-zinc-100 py-1.5 first:border-t-0"
                data-test="audio-track"
            >
                <audio
                    :ref="(el) => (players[track.key] = el as HTMLAudioElement)"
                    :src="track.src"
                    preload="none"
                    class="hidden"
                    @error="failed[track.key] = true"
                    @ended="stop(track.key)"
                />

                <button
                    type="button"
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-300"
                    :disabled="failed[track.key] || !track.src"
                    :title="failed[track.key] ? 'This file could not be loaded' : 'Play'"
                    data-test="audio-play"
                    @click="toggle(track.key)"
                >
                    <MusicalNoteIcon v-if="failed[track.key]" class="h-3.5 w-3.5" />
                    <PauseIcon v-else-if="playingKey == track.key" class="h-3.5 w-3.5" />
                    <PlayIcon v-else class="h-3.5 w-3.5" />
                </button>

                <span class="truncate text-sm text-zinc-900">{{ track.name }}</span>

                <LBadge v-if="track.code" class="ml-auto uppercase" variant="info" size="sm">
                    {{ track.code }}
                </LBadge>
            </div>
        </div>

        <p class="mt-2 text-xs text-zinc-500" data-test="audio-note">
            Read-only, and still played in the app. New media comes from the encoder.
        </p>
    </div>
</template>
