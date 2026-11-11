import { computed, ref, shallowRef, watch } from "vue";
import type { ContentDto } from "luminary-shared";
import type { SleepTimerOption } from "@luminary-media-converter/player-web";
import { effectiveDataSaverLevel } from "@/globalConfig";

const CHOSEN_MODE_KEY = "mediaPlayerMode";

/** What the media player is playing, and in which audio language. */
export type MediaPlayerItem = {
    content: ContentDto;
    language: string | null | undefined;
    /** The viewer asked for the sound only (true) or the picture (false); unset, Data Saver decides. */
    audio?: boolean;
};

/** The full player, or the bar it shrinks to while the viewer browses on. */
export type MediaPlayerView = "expanded" | "mini";

/** The one item the app-wide media player holds; null when nothing plays. */
export const mediaPlayerItem = shallowRef<MediaPlayerItem | null>(null);

export const mediaPlayerView = ref<MediaPlayerView>("expanded");

/** Whether play starts with the sound only: strict data saving, since a video's picture is most of what it costs. */
export const startsAsAudio = computed(() => effectiveDataSaverLevel.value === "strict");

/**
 * The mode the viewer last chose (true: sound only), kept across restarts; null until they choose. Every item opens
 * in it, by whatever way it was opened, ahead of Data Saver's default.
 */
export const chosenAudio = ref<boolean | null>(readChosenAudio());
watch(chosenAudio, (audio) => {
    try {
        if (audio === null) localStorage.removeItem(CHOSEN_MODE_KEY);
        else localStorage.setItem(CHOSEN_MODE_KEY, audio ? "audio" : "video");
    } catch {
        // Storage refused (private mode, quota): the choice lasts for this session only.
    }
});

function readChosenAudio(): boolean | null {
    try {
        const stored = localStorage.getItem(CHOSEN_MODE_KEY);
        return stored === "audio" ? true : stored === "video" ? false : null;
    } catch {
        return null;
    }
}

const SLEEP_DEFAULT_KEY = "mediaPlayerSleepTimer";

/** The sleep timer the viewer last chose (null: off), kept across restarts and started again with each session. */
export const sleepTimerDefault = ref<SleepTimerOption | null>(readSleepTimerDefault());
watch(sleepTimerDefault, (option) => {
    try {
        if (option) localStorage.setItem(SLEEP_DEFAULT_KEY, JSON.stringify(option));
        else localStorage.removeItem(SLEEP_DEFAULT_KEY);
    } catch {
        // Storage refused: the choice lasts for this session only.
    }
});

function readSleepTimerDefault(): SleepTimerOption | null {
    try {
        const stored = JSON.parse(localStorage.getItem(SLEEP_DEFAULT_KEY) ?? "null");
        if (stored?.kind === "chapter") return { kind: "chapter" };
        if (stored?.kind === "minutes" && Number(stored.minutes) > 0)
            return { kind: "minutes", minutes: Number(stored.minutes) };
    } catch {
        // An unreadable value is no default.
    }
    return null;
}

/**
 * The mode a new item opens in: what was asked for the item, else the viewer's last choice, else sound under strict
 * data saving (its default holds only until the viewer has chosen a mode), else the picture.
 */
export function opensAsAudio(item: Pick<MediaPlayerItem, "audio">): boolean {
    return item.audio ?? chosenAudio.value ?? startsAsAudio.value;
}

/**
 * Plays `content` in the media player, opened full; the content already playing just reopens.
 * `audio` asks for the sound only or the picture, and switches the content already playing to it.
 */
export function openMediaPlayer(
    content: ContentDto,
    language: string | null | undefined,
    options: { audio?: boolean } = {},
): void {
    const current = mediaPlayerItem.value;
    if (current?.content._id !== content._id) {
        mediaPlayerItem.value = { content, language, audio: options.audio };
    } else if (options.audio !== undefined) {
        mediaPlayerItem.value = { ...current, audio: options.audio };
    }
    mediaPlayerView.value = "expanded";
}

export function minimiseMediaPlayer(): void {
    if (mediaPlayerItem.value) mediaPlayerView.value = "mini";
}

export function expandMediaPlayer(): void {
    if (mediaPlayerItem.value) mediaPlayerView.value = "expanded";
}

/** Stops playback and removes the player. */
export function closeMediaPlayer(): void {
    mediaPlayerItem.value = null;
    mediaPlayerView.value = "expanded";
}
