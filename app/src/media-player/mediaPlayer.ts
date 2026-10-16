import { computed, ref, shallowRef } from "vue";
import type { ContentDto } from "luminary-shared";
import { isDataSaverEnabled, userDataSaverEnabled } from "@/globalConfig";

/** What the media player is playing, and in which audio language. */
export type MediaPlayerItem = {
    content: ContentDto;
    language: string | null | undefined;
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

/** Plays `content` in the media player, opened full; the content already playing just reopens. */
export function openMediaPlayer(content: ContentDto, language: string | null | undefined): void {
    if (mediaPlayerItem.value?.content._id !== content._id) {
        mediaPlayerItem.value = { content, language };
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
