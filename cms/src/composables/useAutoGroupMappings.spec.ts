import { beforeEach, describe, expect, it, vi } from "vitest";
import { AckStatus } from "luminary-shared";
import { useAutoGroupMappings } from "./useAutoGroupMappings";

const sharedMock = vi.hoisted(() => ({
    save: vi.fn(),
    remove: vi.fn(),
}));

vi.mock("luminary-shared", async () => {
    const { ref } = await import("vue");

    return {
        AckStatus: {
            Accepted: "accepted",
            Rejected: "rejected",
        },
        AclPermission: {
            CmsView: "cmsView",
            Edit: "edit",
        },
        DocType: {
            AutoGroupMappings: "autoGroupMappings",
            AuthProvider: "authProvider",
            Group: "group",
        },
        hasAnyPermission: vi.fn(() => true),
        useHybridQueryWithState: vi.fn(() => ({ output: ref([]), isFetching: ref(false) })),
        useSharedHybridQuery: vi.fn(() => ref([])),
        toEditable: vi.fn(() => ({
            editable: ref([]),
            save: sharedMock.save,
            remove: sharedMock.remove,
        })),
    };
});

describe("useAutoGroupMappings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sharedMock.save.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    it("returns the delete ack from remove without a follow-up save", async () => {
        sharedMock.remove.mockResolvedValue({
            ack: AckStatus.Rejected,
            message: "Rejected by server",
        });

        const { deleteMapping } = useAutoGroupMappings();
        const res = await deleteMapping("mapping-1");

        expect(res).toEqual({ ack: AckStatus.Rejected, message: "Rejected by server" });
        expect(sharedMock.remove).toHaveBeenCalledWith("mapping-1");
        expect(sharedMock.save).not.toHaveBeenCalled();
    });
});
