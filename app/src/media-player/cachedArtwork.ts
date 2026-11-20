import { ref } from "vue";
import type { ContentDto } from "luminary-shared";
import { imageFileUrls } from "./coverImage";
import { fallbackArtworkDataUrl } from "@/util/fallbackArtwork";

/** The browser's word on whether the device has a network: off, a native screen gets the picture as data. */
export const deviceOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
if (typeof window !== "undefined") {
    window.addEventListener("online", () => (deviceOnline.value = true));
    window.addEventListener("offline", () => (deviceOnline.value = false));
}

/** Large enough for the now-playing cover, so a file this wide is preferred over a thumbnail. */
const PREFERRED_WIDTH = 480;
/** A picture that travels over the bridge with every screen update stays small. */
const MAX_BYTES = 600_000;

const made = new Map<string, Promise<string | undefined>>();

/**
 * The post's picture as a `data:` URL, for a native screen while the device is offline: native cannot reach the
 * bucket then, but the browser may hold a file of the post's image that the page drew. Each file is asked of the HTTP
 * cache in turn; with none held (or one the bucket does not allow to be read), the app's stand-in picture.
 */
export function offlineArtworkDataUrl(
    content: ContentDto,
    bucketBaseUrl: string | undefined,
): Promise<string | undefined> {
    const key = `${content._id}|${bucketBaseUrl ?? ""}`;
    let promise = made.get(key);
    if (!promise) {
        promise = fromCache(imageFileUrls(content, bucketBaseUrl, PREFERRED_WIDTH)).then(
            (cached) => {
                // A miss is asked again next time: the page may have drawn the picture since.
                if (!cached) made.delete(key);
                return cached ?? fallbackArtworkDataUrl(content.parentId);
            },
        );
        made.set(key, promise);
    }
    return promise;
}

async function fromCache(urls: string[]): Promise<string | undefined> {
    for (const url of urls) {
        try {
            const response = await fetch(url, { cache: "force-cache", mode: "cors" });
            if (!response.ok) continue;
            const blob = await response.blob();
            if (!blob.type.startsWith("image/") || blob.size > MAX_BYTES) continue;
            return await readAsDataUrl(blob);
        } catch {
            // Not held, or not readable: the next file.
        }
    }
    return undefined;
}

function readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
