import { beforeEach, describe, expect, it, vi } from "vitest";
import { AckStatus } from "luminary-shared";
import { useDefaultAffinity } from "./useDefaultAffinity";

const sharedMock = vi.hoisted(() => ({
    save: vi.fn(),
}));

const DEFAULT_AFFINITY_CONFIG = vi.hoisted(() => ({
    tierHalfLifeDays: { core: 120, strong: 60, established: 25, unprotected: 45 },
    tierWeight: { core: 1.0, strong: 0.6, established: 0.3, unprotected: 0.3 },
    hitWeight: 0.04,
    minScore: 0.01,
    maxTags: 50,
    depthScale: 20,
    readFloorPercent: 20,
    eventWeight: {
        bookmark: 0.25,
        bookmarkRemoved: -0.15,
        completion: 0.35,
        readCompletion: 0.35,
        highlight: 0.3,
        highlightRemoved: -0.18,
        impression: -0.02,
    },
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
        DEFAULT_AFFINITY_CONFIG,
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

    it("falls back to the default tuning config before the singleton exists", () => {
        const { config } = useDefaultAffinity();
        expect(config.value).toEqual(DEFAULT_AFFINITY_CONFIG);
    });

    it("stages a config update (fixed id) and saves it", async () => {
        const { saveConfig } = useDefaultAffinity();
        const customConfig = { ...DEFAULT_AFFINITY_CONFIG, hitWeight: 0.1 };
        const res = await saveConfig(customConfig, ["group-super-admins"]);

        expect(res).toEqual({ ack: AckStatus.Accepted });
        expect(sharedMock.save).toHaveBeenCalledWith("default-affinity");
    });
});
