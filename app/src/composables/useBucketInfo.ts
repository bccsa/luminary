import { computed, type Ref } from "vue";
import { type S3BucketDto, db, useDexieLiveQuery, type Uuid } from "luminary-shared";

/**
 * Get bucket information for constructing image URLs
 */
export function useBucketInfo(bucketId: Ref<Uuid | undefined>) {
    // Get all storage buckets from the database
    const allBuckets = useDexieLiveQuery(
        () => db.docs.where({ type: "storage" }).toArray() as unknown as Promise<S3BucketDto[]>,
        { initialValue: [] as S3BucketDto[] },
    );

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
