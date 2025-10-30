import { ref, computed, watch } from "vue";
import type { S3BucketDto } from "../types";
import { BucketStatus } from "../types/enum";
import { config } from "../config";

export type BucketStatusInfo = {
    connectionStatus: BucketStatus;
    statusMessage?: string;
};

export type BucketWithStatus = S3BucketDto & BucketStatusInfo;

/**
 * Reactive composable for checking bucket connectivity status
 * This function makes API calls to check bucket status and maintains reactive state
 */
export function useBucketStatus(buckets: { value: S3BucketDto[] }) {
    // Map to store bucket status by bucket ID
    const statusMap = ref(new Map<string, BucketStatusInfo>());

    /**
     * Fetch the status of a single bucket from the API
     */
    async function fetchBucketStatus(bucket: S3BucketDto): Promise<void> {
        // Default when no credentials
        if (!bucket.credential && !bucket.credential_id) {
            statusMap.value.set(bucket._id as string, {
                connectionStatus: BucketStatus.NoCredential,
            });
            return;
        }

        // Prepare request
        try {
            // Ensure apiUrl and token come from shared config
            const apiUrl = config?.apiUrl ?? "";
            const token = config?.token ?? "";

            // Mark as checking
            statusMap.value.set(bucket._id as string, {
                connectionStatus: BucketStatus.Checking,
            });

            const res = await fetch(`${apiUrl.replace(/\/$/, "")}/storage/bucket-status`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: token ? `Bearer ${token}` : "",
                },
                body: JSON.stringify({ bucketId: bucket._id, apiVersion: "0.0.0" }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                statusMap.value.set(bucket._id as string, {
                    connectionStatus: BucketStatus.Unreachable,
                    statusMessage: `Error: ${res.status} ${res.statusText} ${text}`,
                });
                return;
            }

            const json = await res.json().catch(() => null);
            if (!json || !json.status) {
                statusMap.value.set(bucket._id as string, {
                    connectionStatus: BucketStatus.Unknown,
                    statusMessage: json?.message,
                });
                return;
            }

            statusMap.value.set(bucket._id as string, {
                connectionStatus: json.status,
                statusMessage: json.message,
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
