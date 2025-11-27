import { ref, computed, watch } from "vue";
import type { StorageDto } from "../types";
import { StorageStatus } from "../types/enum";
import { getRest } from "../rest/RestApi";

export type StorageStatusInfo = {
    connectionStatus: StorageStatus;
    statusMessage?: string;
};

export type BucketWithStatus = StorageDto & StorageStatusInfo;

/**
 * Reactive composable for checking bucket connectivity status
 * This function makes API calls to check bucket status and maintains reactive state
 */
export function useStorageStatus(buckets: { value: StorageDto[] }) {
    // Map to store bucket status by bucket ID
    const statusMap = ref(new Map<string, StorageStatusInfo>());

    /**
     * Fetch the status of a single bucket from the API
     */
    async function fetchStorageStatus(bucket: StorageDto): Promise<void> {
        // Default when no credentials
        if (!bucket.credential && !bucket.credential_id) {
            statusMap.value.set(bucket._id as string, {
                connectionStatus: StorageStatus.NoCredential,
            });
            return;
        }

        // Mark as checking
        statusMap.value.set(bucket._id as string, {
            connectionStatus: StorageStatus.Checking,
        });

        try {
            // Use the RestApi singleton to make the request
            const rest = getRest();
            const result = await rest.getStorageStatus(bucket._id as string);

            if (!result || !result.status) {
                statusMap.value.set(bucket._id as string, {
                    connectionStatus: StorageStatus.Unknown,
                    statusMessage: result?.message,
                });
                return;
            }

            // Map API response status to StorageStatus enum
            const statusMap_temp: Record<string, StorageStatus> = {
                connected: StorageStatus.Connected,
                unreachable: StorageStatus.Unreachable,
                unauthorized: StorageStatus.Unauthorized,
                "not-found": StorageStatus.NotFound,
                "no-credentials": StorageStatus.NoCredential,
            };

            statusMap.value.set(bucket._id as string, {
                connectionStatus: statusMap_temp[result.status] || StorageStatus.Unknown,
                statusMessage: result.message,
            });
        } catch (err: any) {
            statusMap.value.set(bucket._id as string, {
                connectionStatus: StorageStatus.Unreachable,
                statusMessage: err?.message ?? String(err),
            });
        }
    }

    /**
     * Refresh status for all buckets
     */
    async function refreshAllStatuses(): Promise<void> {
        const list = [...buckets.value];
        await Promise.all(list.map((b) => fetchStorageStatus(b)));
    }

    /**
     * Get status for a specific bucket by ID
     */
    function getStorageStatus(bucketId: string): StorageStatusInfo {
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
                    ? StorageStatus.NoCredential
                    : StorageStatus.Unknown,
        };
    }

    /**
     * Computed property that returns all buckets with their status
     */
    const bucketsWithStatus = computed<BucketWithStatus[]>(() => {
        return buckets.value.map((bucket): BucketWithStatus => {
            const status = getStorageStatus(bucket._id as string);
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
        fetchStorageStatus,
        refreshAllStatuses,
        getStorageStatus,
        bucketsWithStatus,
    };
}
