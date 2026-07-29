import { computed, onServerPrefetch, shallowRef, type Ref } from "vue";
import {
    type StorageDto,
    useHybridQuery,
    type Uuid,
    queryRemote,
    structuralCacheKey,
    writeResponseCache,
} from "luminary-shared";

// Storage docs go through the same group/ACL permission system as any other doc type —
// they are NOT exempt from auth scoping — but in practice every storage bucket is
// assigned public access, so the query result is the same regardless of viewer. The
// query shape is constant, so a fixed `cacheId` (unlike useContentQuery's, which varies
// per auth state) keeps its response-cache entry distinct from any same-shaped query;
// this is correct as long as that public-access assumption holds.
const STORAGE_QUERY = { selector: { type: "storage" } };
const STORAGE_CACHE_ID = "storage-buckets";

/**
 * Resolve a storage bucket (for building image URLs) from the fully-synced `storage`
 * reference docs.
 *
 * On the browser — web AND native — this is the normal local-first hybrid query; its
 * `cache: true` seed makes the bucket available on the first render. On the web/SSG
 * build the prerender (Node, no Dexie) fetches the buckets once via the shared
 * `queryRemote` and primes the SAME response cache, so the hydrating client builds
 * real CDN image URLs on first paint with no flash.
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
