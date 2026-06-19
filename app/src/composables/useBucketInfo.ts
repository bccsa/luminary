import { computed, onServerPrefetch, type Ref } from "vue";
import { type StorageDto, useHybridQuery, type Uuid } from "luminary-shared";
import { usePublicContentStore } from "@/stores/publicContent";
import { queryPublic } from "@/ssg/queryPublic";

const IS_WEB = import.meta.env.VITE_BUILD_TARGET === "web";

/**
 * Get bucket information for constructing image URLs.
 *
 * Storage is a fully-synced reference type. On the native/SPA build it comes from
 * the local-first HybridQuery (Dexie). On the web/SSG build that path can't run in
 * Node (no Dexie/socket), so — like the content seam — the build fetches buckets via
 * the public `/query`, the result is serialized for hydration, and the client seeds
 * from it before the live query takes over.
 */
export function useBucketInfo(bucketId: Ref<Uuid | undefined>) {
    let allBuckets: Ref<StorageDto[]>;

    if (!IS_WEB) {
        // `cache: true` seeds the bucket list from localStorage on the first frame
        // so <LImage> doesn't flash a fallback before the Dexie read lands.
        allBuckets = useHybridQuery<StorageDto>(() => ({ selector: { type: "storage" } }), {
            live: true,
            cache: true,
        });
    } else {
        const store = usePublicContentStore();
        // All <LImage> instances read the SAME shared store list (reactive), so the
        // bucket resolves for every tile — not just the one instance that fetched.
        allBuckets = computed(() => store.storageBuckets);
        if (import.meta.env.SSR) {
            // First instance fetches once per build; the rest reuse the filled store.
            onServerPrefetch(async () => {
                if (store.storageBuckets.length) return;
                store.setStorageBuckets(
                    await queryPublic<StorageDto>({ selector: { type: "storage" } }),
                );
            });
        }
        // Client: the store is restored from the snapshot at hydration. Storage is
        // stable reference data, so no client-side live query is needed.
    }

    // Get the specific bucket by ID
    const bucket = computed(() => {
        if (!bucketId.value) return null;
        return allBuckets.value.find((b) => b._id === bucketId.value) || null;
    });

    // Construct the base URL for images from this bucket
    const bucketBaseUrl = computed(() => {
        if (!bucket.value) return;

        // Use the publicUrl from the bucket
        return bucket.value.publicUrl;
    });

    return {
        bucket,
        bucketBaseUrl,
    };
}
