import { ref, computed, watch } from "vue";
import type { StorageDto } from "../types";
import { BucketStatus } from "../types/enum";
import { getRest } from "../rest/RestApi";

export type BucketStatusInfo = {
    connectionStatus: BucketStatus;
    statusMessage?: string;
};

export type BucketWithStatus = StorageDto & BucketStatusInfo;

/**
 * Reactive composable for checking bucket connectivity status
 * This function makes API calls to check bucket status and maintains reactive state
 */
export function useBucketStatus(buckets: { value: StorageDto[] }) {
    // Map to store bucket status by bucket ID
    const statusMap = ref(new Map<string, BucketStatusInfo>());

    /**
     * Fetch the status of a single bucket from the API
     */
    async function fetchBucketStatus(bucket: StorageDto): Promise<void> {
        // Default when no credentials
        if (!bucket.credential && !bucket.credential_id) {
            statusMap.value.set(bucket._id as string, {
                connectionStatus: BucketStatus.NoCredential,
            });
            return;
        }

        // Mark as checking
        statusMap.value.set(bucket._id as string, {
            connectionStatus: BucketStatus.Checking,
        });

        try {
            // Use the RestApi singleton to make the request
            const rest = getRest();
            const result = await rest.getBucketStatus(bucket._id as string);

            if (!result || !result.status) {
                statusMap.value.set(bucket._id as string, {
                    connectionStatus: BucketStatus.Unknown,
                    statusMessage: result?.message,
                });
                return;
            }

            // Map API response status to BucketStatus enum
            const statusMap_temp: Record<string, BucketStatus> = {
                connected: BucketStatus.Connected,
                unreachable: BucketStatus.Unreachable,
                unauthorized: BucketStatus.Unauthorized,
                "not-found": BucketStatus.NotFound,
                "no-credentials": BucketStatus.NoCredential,
            };

            statusMap.value.set(bucket._id as string, {
                connectionStatus: statusMap_temp[result.status] || BucketStatus.Unknown,
                statusMessage: result.message,
            });
        } catch (err: any) {
            statusMap.value.set(bucket._id as string, {
                connectionStatus: BucketStatus.Unreachable,
                statusMessage: err?.message ?? String(err),
            });
        }
    }

    /**
     * Refresh status for all buckets
     */
    async function refreshAllStatuses(): Promise<void> {
        const list = [...buckets.value];
        await Promise.all(list.map((b) => fetchBucketStatus(b)));
    }

    /**
     * Get status for a specific bucket by ID
     */
    function getBucketStatus(bucketId: string): BucketStatusInfo {
        const entry = statusMap.value.get(bucketId);
        if (entry) {
            return entry;
        }

        // Find the bucket to check for credentials
        const bucket = buckets.value.find((b) => b._id === bucketId);

        // Fallback initial state
        return {
            connectionStatus:
                bucket && !bucket.credential && !bucket.credential_id
                    ? BucketStatus.NoCredential
                    : BucketStatus.Unknown,
        };
    }

    /**
     * Computed property that returns all buckets with their status
     */
    const bucketsWithStatus = computed<BucketWithStatus[]>(() => {
        return buckets.value.map((bucket): BucketWithStatus => {
            const status = getBucketStatus(bucket._id as string);
            return {
                ...bucket,
                ...status,
            };
        });
    });

    // Watch for changes in buckets and refresh statuses
    watch(
        buckets,
        () => {
            refreshAllStatuses().catch(() => {});
        },
        { deep: true },
    );

    return {
        statusMap,
        fetchBucketStatus,
        refreshAllStatuses,
        getBucketStatus,
        bucketsWithStatus,
    };
}
