import Rand from "rand-seed";
import type { Uuid } from "luminary-shared";
import { fallbackImageUrls } from "@/globalConfig";

/** Wide enough for a lock screen's artwork, small enough to travel with a load. */
const MAX_SIDE = 640;
const JPEG_QUALITY = 0.8;
/**
 * How long the player may be kept waiting for the stand-in. A bundled image is on screen in
 * milliseconds; one that has not come in this long is not coming, and playback must not wait on it.
 */
const GIVE_UP_MS = 1500;

/**
 * The stand-in picture the page shows for a post whose own image does not load: chosen from the
 * app's bundled set by the post's id, the way `LImageProvider` chooses it, so the lock screen
 * shows the very image the post has on the page.
 */
export function fallbackImageFor(parentId: Uuid | undefined): string | undefined {
    if (!parentId || !fallbackImageUrls.length) return undefined;
    return fallbackImageUrls[Math.floor(new Rand(parentId).next() * fallbackImageUrls.length)];
}

const cache = new Map<string, Promise<string | undefined>>();

/**
 * A bundled image as a small JPEG `data:` URL. The native shell cannot fetch an address inside the
 * page's own bundle, so the picture travels as data. Undefined when it cannot be made (no canvas,
 * a failed load): the lock screen then simply has no stand-in.
 */
export function fallbackArtworkDataUrl(parentId: Uuid | undefined): Promise<string | undefined> {
    const url = fallbackImageFor(parentId);
    if (!url) return Promise.resolve(undefined);
    let made = cache.get(url);
    if (!made) {
        made = toDataUrl(url);
        cache.set(url, made);
    }
    return Promise.race([
        made,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), GIVE_UP_MS)),
    ]);
}

function toDataUrl(url: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            try {
                const scale = Math.min(
                    1,
                    MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
                );
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
                const context = canvas.getContext("2d");
                if (!context) return resolve(undefined);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
                resolve(dataUrl.startsWith("data:image/") ? dataUrl : undefined);
            } catch {
                resolve(undefined);
            }
        };
        image.onerror = () => resolve(undefined);
        image.src = url;
    });
}
