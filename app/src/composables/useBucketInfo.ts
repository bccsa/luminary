import { computed, onServerPrefetch, shallowRef, type Ref } from "vue";
import {
    type StorageDto,
    useSharedHybridQuery,
    type Uuid,
    queryRemote,
    structuralCacheKey,
    writeResponseCache,
} from "luminary-shared";
import { useRoute } from "vue-router";
import { isPrerender } from "@/ssg/isPrerender";
import { captureCacheEntry } from "@/ssg/dependencyCapture";
import { hasPersistedSession } from "@/auth";

// Storage buckets use a fixed `cacheId` so this query's response-cache entry stays distinct from same-shaped queries. Storage docs are ACL-scoped like every other doc, so the entry holds whatever the current viewer can see; the build's copy is fetched anonymously, which is what keeps a non-public bucket out of the inlined page seed.
const STORAGE_QUERY = { selector: { type: "storage" }, identifier: "ssgPrerender" };
const STORAGE_CACHE_ID = "storage-buckets";

// Buckets are group-scoped, so a signed-in viewer's window can hold one an anonymous viewer
// must not see. Scope the entry by auth state (same `:auth`/`:anon` split `useContentQuery`
// applies) so the two never share a key in one browser. The prerender is always anonymous.
function storageCacheId(): string {
    return `${STORAGE_CACHE_ID}:${hasPersistedSession() ? "auth" : "anon"}`;
}
const STORAGE_CACHE_ID_ANON = `${STORAGE_CACHE_ID}:anon`;

// Storage buckets are public and identical for every prerendered page, so the whole SSG
// build fetches them once. A PROMISE cache (not a resolved-value cache guarded by
// `if (!x)`) is required: every `useBucketInfo()` call on one page's render runs
// synchronously up to its first `await`, so without caching the in-flight promise itself
// they'd all race and each fire their own fetch, even at the default concurrency of 1.
let bucketsPromise: Promise<StorageDto[]> | undefined;
function fetchBucketsOnce(): Promise<StorageDto[]> {
    if (!bucketsPromise) {
        bucketsPromise = queryRemote<StorageDto>(STORAGE_QUERY).catch((err) => {
            // Don't let one transient failure poison the rest of the build — let the next page's render retry.
            bucketsPromise = undefined;
            throw err;
        });
    }
    return bucketsPromise;
}

// One seed write per rendered page. `useBucketInfo` runs per <LImage>, but the entry is
// identical for every call on a page, so the first one writes it and the rest are no-ops.
const seededRoutes = new Set<string>();

// Prime the response cache under the SAME key the client computes, and attribute it to the
// page so it is inlined into the HTML. Without this the client renders its first frame with
// no bucket URL, which resolves to an empty srcset and paints the fallback image.
function seedBucketCache(route: string, buckets: StorageDto[]): void {
    if (!buckets.length || seededRoutes.has(route)) return;
    seededRoutes.add(route);
    // No field stripping: bucket docs are small, and a stripped seed can outlive the live
    // read for the session when the window looks unchanged and the republish is suppressed.
    const cacheKey = structuralCacheKey(STORAGE_QUERY, STORAGE_CACHE_ID_ANON);
    writeResponseCache<StorageDto>(cacheKey, { local: buckets, remote: [] });
    captureCacheEntry(route, cacheKey);
}

/**
 * Resolve a storage bucket from the fully-synced `storage` docs for building image URLs. On the browser the hybrid query's `cache: true` seed makes the bucket available on first render; the SSG prerender fetches once for the whole build via `queryRemote` and seeds that same cache entry into the page, so the client builds real CDN URLs on first paint with no flash.
 */
export function useBucketInfo(bucketId: Ref<Uuid | undefined>) {
    let allBuckets: Ref<StorageDto[]>;

    if (isPrerender()) {
        const out = shallowRef<StorageDto[]>([]);
        // Read during setup: vite-ssg pushes the router to the route being prerendered before
        // rendering, so this is the page the seed below belongs to.
        const route = useRoute().path;
        onServerPrefetch(async () => {
            out.value = await fetchBucketsOnce();
            seedBucketCache(route, out.value);
        });
        allBuckets = out;
    } else {
        // Shared instance: every <LImage> on the page asks for this same list, and N copies
        // would mean N Dexie subscriptions and N cold-start POSTs of the same query.
        allBuckets = useSharedHybridQuery<StorageDto>(STORAGE_QUERY, {
            live: true,
            cache: true,
            cacheId: storageCacheId(),
        });
    }

    const bucket = computed(() =>
        bucketId.value ? allBuckets.value.find((b) => b._id === bucketId.value) || null : null,
    );

    const bucketBaseUrl = computed(() => bucket.value?.publicUrl);

    return { bucket, bucketBaseUrl };
}
