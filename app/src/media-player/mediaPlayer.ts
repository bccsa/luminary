import { computed, ref, shallowRef } from "vue";
import type { ContentDto } from "luminary-shared";
import { isDataSaverEnabled, userDataSaverEnabled } from "@/globalConfig";

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

/**
 * Whether play starts with the sound only. Data Saver, the user's or the device's, already means
 * "spend less data"; a video's picture is most of what it costs.
 */
export const startsAsAudio = computed(() => userDataSaverEnabled.value || isDataSaverEnabled());

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
