import type { MediaPlayerError } from "@/build-time/contracts/media-player/contract";

const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** Map a DOM {@link HTMLAudioElement} media error to a stable {@link MediaPlayerError}. */
export function mediaPlayerErrorFromElement(audio: HTMLAudioElement): MediaPlayerError {
    const mediaError = audio.error;
    if (!mediaError) {
        return { message: "Audio playback failed", retryable: true };
    }

    switch (mediaError.code) {
        case MEDIA_ERR_NETWORK:
            return {
                message: "Network error. Please check your internet connection.",
                code: mediaError.code,
                retryable: true,
            };
        case MEDIA_ERR_SRC_NOT_SUPPORTED:
            return {
                message: "Audio format not supported by your browser.",
                code: mediaError.code,
                retryable: false,
            };
        case MEDIA_ERR_ABORTED:
            return {
                message: "Audio loading was cancelled.",
                code: mediaError.code,
                retryable: true,
            };
        case MEDIA_ERR_DECODE:
            return {
                message: "Audio file is corrupted or cannot be decoded.",
                code: mediaError.code,
                retryable: false,
            };
        default:
            return {
                message: "Unknown audio error occurred.",
                code: mediaError.code,
                retryable: true,
            };
    }
}
