import { ref, computed } from "vue";
import { type StorageDto, db, useDexieLiveQuery, BucketType } from "luminary-shared";

export function useBucketSelection() {
    const selectedImageBucket = ref<string | null>(null);
    const selectedMediaBucket = ref<string | null>(null);

    // Get buckets directly from the database (already available in CMS)
    const buckets = useDexieLiveQuery(
        () => db.docs.where({ type: "storage" }).toArray() as unknown as Promise<StorageDto[]>,
        { initialValue: [] as StorageDto[] },
    );

    /**
     * Get bucket by ID
     */
    const getBucketById = (bucketId: string | null): StorageDto | null => {
        if (!bucketId) return null;
        return buckets.value.find((bucket) => bucket._id === bucketId) || null;
    };

    /**
     * Get buckets suitable for image uploads
     */
    const imageBuckets = computed(() => {
        return buckets.value.filter((bucket) => bucket.bucketType === BucketType.Image);
    });

    /**
     * Get buckets suitable for media uploads
     */
    const mediaBuckets = computed(() => {
        return buckets.value.filter((bucket) => bucket.bucketType === BucketType.Media);
    });

    /**
     * Auto-select bucket if only one exists
     */
    const autoSelectImageBucket = computed(() => {
        return imageBuckets.value.length === 1 ? imageBuckets.value[0]._id : null;
    });

    const autoSelectMediaBucket = computed(() => {
        return mediaBuckets.value.length === 1 ? mediaBuckets.value[0]._id : null;
    });

    /**
     * Check if bucket selection is needed (more than one bucket)
     */
    const needsImageBucketSelection = computed(() => {
        return imageBuckets.value.length > 1;
    });

    const needsMediaBucketSelection = computed(() => {
        return mediaBuckets.value.length > 1;
    });

    /**
     * Check if any buckets are available
     */
    const hasImageBuckets = computed(() => {
        return imageBuckets.value.length > 0;
    });

    const hasMediaBuckets = computed(() => {
        return mediaBuckets.value.length > 0;
    });

    return {
        // All buckets
        buckets,

        // Bucket data
        imageBuckets,
        mediaBuckets,

        // Auto-selection
        autoSelectImageBucket,
        autoSelectMediaBucket,

        // Selection state
        selectedImageBucket,
        selectedMediaBucket,

        // Computed checks
        needsImageBucketSelection,
        needsMediaBucketSelection,
        hasImageBuckets,
        hasMediaBuckets,

        // Methods
        getBucketById,
    };
}
