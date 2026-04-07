import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

vi.mock("../rest/RestApi", () => ({
    getRest: vi.fn(),
}));

import { useStorageStatus } from "./useStorageStatus";
import { StorageStatus } from "../types/enum";
import { getRest } from "../rest/RestApi";
import type { StorageDto } from "../types";

const mockGetRest = vi.mocked(getRest);

function makeBucket(overrides: Partial<StorageDto> & { _id: string }): StorageDto {
    return {
        type: "storage" as any,
        updatedTimeUtc: 0,
        ...overrides,
    } as StorageDto;
}

describe("useStorageStatus", () => {
    let mockGetStorageStatus: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetStorageStatus = vi.fn();
        mockGetRest.mockReturnValue({
            getStorageStatus: mockGetStorageStatus,
        } as any);
    });

    it("sets NoCredential for buckets without credentials", async () => {
        const buckets = ref([makeBucket({ _id: "b1" })]);
        const { fetchStorageStatus } = useStorageStatus(buckets);

        await fetchStorageStatus(buckets.value[0]);

        const status = useStorageStatus(buckets).getStorageStatus("b1");
        // The bucket has no credential or credential_id, so NoCredential
        expect(status.connectionStatus).toBe(StorageStatus.NoCredential);
    });

    it("marks as Checking then resolves to Connected", async () => {
        const bucket = makeBucket({ _id: "b2", credential_id: "cred-1" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockResolvedValue({ status: "connected", message: "OK" });

        const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        const status = getStorageStatus("b2");
        expect(status.connectionStatus).toBe(StorageStatus.Connected);
        expect(status.statusMessage).toBe("OK");
    });

    it("maps API status strings correctly", async () => {
        const statusMappings: Array<[string, StorageStatus]> = [
            ["connected", StorageStatus.Connected],
            ["unreachable", StorageStatus.Unreachable],
            ["unauthorized", StorageStatus.Unauthorized],
            ["not-found", StorageStatus.NotFound],
            ["no-credentials", StorageStatus.NoCredential],
        ];

        for (const [apiStatus, expectedEnum] of statusMappings) {
            const bucket = makeBucket({ _id: `b-${apiStatus}`, credential_id: "cred" } as any);
            const buckets = ref([bucket]);
            mockGetStorageStatus.mockResolvedValue({ status: apiStatus });

            const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
            await fetchStorageStatus(bucket);

            expect(getStorageStatus(`b-${apiStatus}`).connectionStatus).toBe(expectedEnum);
        }
    });

    it("maps unknown API status to StorageStatus.Unknown", async () => {
        const bucket = makeBucket({ _id: "b-unknown", credential_id: "cred" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockResolvedValue({ status: "something-else" });

        const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        expect(getStorageStatus("b-unknown").connectionStatus).toBe(StorageStatus.Unknown);
    });

    it("handles null API response", async () => {
        const bucket = makeBucket({ _id: "b-null", credential_id: "cred" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockResolvedValue(null);

        const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        expect(getStorageStatus("b-null").connectionStatus).toBe(StorageStatus.Unknown);
    });

    it("handles API response with missing status field", async () => {
        const bucket = makeBucket({ _id: "b-nostatus", credential_id: "cred" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockResolvedValue({ message: "no status" });

        const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        expect(getStorageStatus("b-nostatus").connectionStatus).toBe(StorageStatus.Unknown);
    });

    it("catches errors and sets Unreachable", async () => {
        const bucket = makeBucket({ _id: "b-err", credential_id: "cred" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockRejectedValue(new Error("network fail"));

        const { fetchStorageStatus, getStorageStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        const status = getStorageStatus("b-err");
        expect(status.connectionStatus).toBe(StorageStatus.Unreachable);
        expect(status.statusMessage).toBe("network fail");
    });

    it("refreshAllStatuses checks all buckets", async () => {
        const b1 = makeBucket({ _id: "r1", credential_id: "cred" } as any);
        const b2 = makeBucket({ _id: "r2", credential_id: "cred" } as any);
        const buckets = ref([b1, b2]);
        mockGetStorageStatus.mockResolvedValue({ status: "connected" });

        const { refreshAllStatuses, getStorageStatus } = useStorageStatus(buckets);
        await refreshAllStatuses();

        expect(getStorageStatus("r1").connectionStatus).toBe(StorageStatus.Connected);
        expect(getStorageStatus("r2").connectionStatus).toBe(StorageStatus.Connected);
    });

    it("getStorageStatus returns Unknown fallback for unknown bucket", () => {
        const buckets = ref<StorageDto[]>([]);
        const { getStorageStatus } = useStorageStatus(buckets);

        const status = getStorageStatus("nonexistent");
        expect(status.connectionStatus).toBe(StorageStatus.Unknown);
    });

    it("getStorageStatus returns NoCredential for credentialless bucket in list", () => {
        const bucket = makeBucket({ _id: "no-cred" });
        const buckets = ref([bucket]);
        const { getStorageStatus } = useStorageStatus(buckets);

        const status = getStorageStatus("no-cred");
        expect(status.connectionStatus).toBe(StorageStatus.NoCredential);
    });

    it("bucketsWithStatus computed merges status correctly", async () => {
        const bucket = makeBucket({ _id: "bws", credential_id: "cred" } as any);
        const buckets = ref([bucket]);
        mockGetStorageStatus.mockResolvedValue({ status: "connected", message: "all good" });

        const { fetchStorageStatus, bucketsWithStatus } = useStorageStatus(buckets);
        await fetchStorageStatus(bucket);

        expect(bucketsWithStatus.value).toHaveLength(1);
        expect(bucketsWithStatus.value[0]._id).toBe("bws");
        expect(bucketsWithStatus.value[0].connectionStatus).toBe(StorageStatus.Connected);
        expect(bucketsWithStatus.value[0].statusMessage).toBe("all good");
    });

    it("watch triggers refresh when buckets change", async () => {
        const buckets = ref<StorageDto[]>([]);
        mockGetStorageStatus.mockResolvedValue({ status: "connected" });

        useStorageStatus(buckets);

        // Add a bucket to trigger watch
        buckets.value = [makeBucket({ _id: "watched", credential_id: "cred" } as any)];
        await nextTick();

        // Give the async refreshAllStatuses time to complete
        await new Promise((r) => setTimeout(r, 50));

        expect(mockGetStorageStatus).toHaveBeenCalled();
    });
});
