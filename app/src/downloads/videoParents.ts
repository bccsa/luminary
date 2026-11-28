import { ref } from "vue";

const KEY = "luminary:video-parents";

function load(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
        return {};
    }
}

/**
 * Whether an item's source has a picture, as last seen online (its download options, or the stream playing). Kept on
 * the device, so a download of the sound alone can still tell offline whether Video exists to offer.
 */
const known = ref<Record<string, boolean>>(load());

export function rememberHasVideo(parentId: string, hasVideo: boolean): void {
    if (known.value[parentId] === hasVideo) return;
    known.value = { ...known.value, [parentId]: hasVideo };
    try {
        localStorage.setItem(KEY, JSON.stringify(known.value));
    } catch {
        // A full or blocked store keeps the answer for this session only.
    }
}

/** True only when the source is known to have a picture; unknown counts as none, so no Video is offered for nothing. */
export function hasVideo(parentId: string | undefined): boolean {
    return !!parentId && known.value[parentId] === true;
}
