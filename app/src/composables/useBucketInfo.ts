import { computed, onServerPrefetch, shallowRef, type Ref } from "vue";
import {
    type StorageDto,
    useHybridQuery,
    type Uuid,
    queryRemote,
    structuralCacheKey,
    writeResponseCache,
} from "luminary-shared";

// Storage buckets use a fixed `cacheId` so this query's response-cache entry stays distinct from same-shaped queries. The result is the same for every viewer since buckets are public.
const STORAGE_QUERY = { selector: { type: "storage" } };
const STORAGE_CACHE_ID = "storage-buckets";

/**
 * Resolve a storage bucket from the fully-synced `storage` docs for building image URLs. On the browser the hybrid query's `cache: true` seed makes the bucket available on first render; the SSG prerender fetches once via `queryRemote` and primes the same cache so the client builds real CDN URLs on first paint with no flash.
 */
export function useBucketInfo(bucketId: Ref<Uuid | undefined>) {
    let allBuckets: Ref<StorageDto[]>;

    if (import.meta.env.SSR) {
        const out = shallowRef<StorageDto[]>([]);
        onServerPrefetch(async () => {
            const docs = await queryRemote<StorageDto>(STORAGE_QUERY);
            out.value = docs;
            writeResponseCache(structuralCacheKey(STORAGE_QUERY, STORAGE_CACHE_ID), {
                local: docs,
                remote: [],
            });
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
