import { computed, onServerPrefetch, shallowRef, type Ref } from "vue";
import { type StorageDto, useHybridQuery, type Uuid, queryRemote } from "luminary-shared";
import { isPrerender } from "@/ssg/isPrerender";

// Storage buckets use a fixed `cacheId` so this query's response-cache entry stays distinct from same-shaped queries. Storage docs aren't exempt from the ACL/auth-scoping every doc goes through — they're just always assigned public access in practice, which is what makes one shared cache entry safe for every viewer.
const STORAGE_QUERY = { selector: { type: "storage" }, identifier: "ssgPrerender" };
const STORAGE_CACHE_ID = "storage-buckets";

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

/**
 * Resolve a storage bucket from the fully-synced `storage` docs for building image URLs. On the browser the hybrid query's `cache: true` seed makes the bucket available on first render; the SSG prerender fetches once for the whole build via `queryRemote` so the client builds real CDN URLs on first paint with no flash.
 */
export function useBucketInfo(bucketId: Ref<Uuid | undefined>) {
    let allBuckets: Ref<StorageDto[]>;

    if (isPrerender()) {
        const out = shallowRef<StorageDto[]>([]);
        onServerPrefetch(async () => {
            out.value = await fetchBucketsOnce();
        });
        allBuckets = out;
    } else {
        allBuckets = useHybridQuery<StorageDto>(() => STORAGE_QUERY, {
            live: true,
            cache: true,
            cacheId: STORAGE_CACHE_ID,
        });
    }

    const bucket = computed(() =>
        bucketId.value ? allBuckets.value.find((b) => b._id === bucketId.value) || null : null,
    );

    const bucketBaseUrl = computed(() => bucket.value?.publicUrl);

    return { bucket, bucketBaseUrl };
}
