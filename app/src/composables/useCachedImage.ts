import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";

/**
 * Name of the Cache Storage bucket used for offline content images.
 * Visible in DevTools → Application → Cache Storage.
 */
export const IMAGE_CACHE_NAME = "luminary-images";

/**
 * Reactively resolve a (cross-origin, CDN-hosted) image URL to a local object URL backed by
 * the Cache API, so the image is available offline.
 *
 * On first use the image is fetched, stored in the {@link IMAGE_CACHE_NAME} cache, and exposed
 * as a `blob:` object URL. On subsequent uses (including while offline) it is served straight
 * from the cache without a network request.
 *
 * Requirements & behaviour:
 * - The image host MUST send CORS headers (`Access-Control-Allow-Origin`); an opaque
 *   cross-origin response cannot be read as a blob and is treated as a failure.
 * - When the Cache API / `fetch` are unavailable (e.g. SSR, insecure context, some test
 *   environments) the raw URL is returned unchanged so rendering still works online.
 * - On failure (offline + uncached, or a CORS/HTTP error) `error` is set so the caller can
 *   fall back to a bundled placeholder.
 *
 * Object URLs we create are revoked when the source changes and when the owning scope is
 * disposed, to avoid blob leaks.
 *
 * Intended for `<img>` elements pointing at CDN images only — bundled (same-origin) assets and
 * local `uploadData` blobs do not need this.
 */
export function useCachedImage(source: MaybeRefOrGetter<string | undefined>): {
    objectUrl: Ref<string | undefined>;
    error: Ref<boolean>;
} {
    const objectUrl = ref<string | undefined>(undefined);
    const error = ref(false);

    // The object URL we created and therefore own (must be revoked). When we fall back to a
    // raw URL we do NOT own it and must not revoke it.
    let ownedObjectUrl: string | undefined;

    const revokeOwned = () => {
        if (ownedObjectUrl) {
            URL.revokeObjectURL(ownedObjectUrl);
            ownedObjectUrl = undefined;
        }
    };

    const resolve = async (url: string | undefined) => {
        revokeOwned();
        error.value = false;

        if (!url) {
            objectUrl.value = undefined;
            return;
        }

        // No Cache API / fetch available: degrade gracefully to the raw URL.
        if (typeof caches === "undefined" || typeof fetch === "undefined") {
            objectUrl.value = url;
            return;
        }

        try {
            const cache = await caches.open(IMAGE_CACHE_NAME);
            let response = await cache.match(url);

            if (!response) {
                response = await fetch(url, { mode: "cors" });
                // Only cache readable, successful responses. Opaque (CORS-less) responses
                // cannot be read as a blob, so treat anything non-ok as a failure.
                if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
                await cache.put(url, response.clone());
            }

            const blob = await response.blob();

            // The source may have changed while we were awaiting; drop this stale result.
            if (toValue(source) !== url) return;

            const created = URL.createObjectURL(blob);
            ownedObjectUrl = created;
            objectUrl.value = created;
        } catch {
            objectUrl.value = undefined;
            error.value = true;
        }
    };

    watch(() => toValue(source), resolve, { immediate: true });

    onScopeDispose(revokeOwned);

    return { objectUrl, error };
}
