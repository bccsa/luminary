import { beforeEach, describe, expect, it, vi } from "vitest";
import { AckStatus } from "luminary-shared";
import { useDefaultAffinity } from "./useDefaultAffinity";

const sharedMock = vi.hoisted(() => ({
    save: vi.fn(),
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
            DefaultAffinity: "defaultAffinity",
        },
        DEFAULT_AFFINITY_ID: "default-affinity",
        hasAnyPermission: vi.fn(() => true),
        useHybridQueryWithState: vi.fn(() => ({ output: ref([]), isFetching: ref(false) })),
        toEditable: vi.fn(() => ({
            editable: ref([]),
            save: sharedMock.save,
        })),
    };
});

describe("useDefaultAffinity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sharedMock.save.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    it("stages a brand-new singleton (fixed id) and saves it when none exists yet", async () => {
        const { saveAffinity } = useDefaultAffinity();
        const res = await saveAffinity({ "tag-a": 0.5 }, ["group-super-admins"]);

        expect(res).toEqual({ ack: AckStatus.Accepted });
        expect(sharedMock.save).toHaveBeenCalledWith("default-affinity");
    });

    it("propagates a rejected ack", async () => {
        sharedMock.save.mockResolvedValue({ ack: AckStatus.Rejected, message: "No access" });

        const { saveAffinity } = useDefaultAffinity();
        const res = await saveAffinity({ "tag-a": 0.5 }, ["group-super-admins"]);

        expect(res).toEqual({ ack: AckStatus.Rejected, message: "No access" });
    });
});
