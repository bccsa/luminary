import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AckStatus, AclPermission, DocType, accessMap } from "luminary-shared";
import { addContribution, maybeFlush } from "./globalContributionStore";
import { affinityConfig } from "./defaultAffinityStore";
import { globalAffinityMemberOf } from "./globalAffinityStore";

const changeRequest = vi.fn();

// Only the REST client is mocked; the permission check reads the real `accessMap` ref, so
// the "nothing is sent without Contribute" cases exercise the real lookup.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, getRest: () => ({ changeRequest }) };
});

const STORAGE_KEY = "globalAffinityContribution";

function grantContribute() {
    accessMap.value = {
        "group-public-content": {
            [DocType.GlobalAffinity]: { [AclPermission.Contribute]: true },
        },
    } as any;
}

function revokeContribute() {
    accessMap.value = {
        "group-public-content": {
            [DocType.GlobalAffinity]: { [AclPermission.View]: true },
        },
    } as any;
}

/** Record enough events to clear the `minEvents` gate. */
function recordEnoughEvents(tags: Record<string, number>) {
    const needed = affinityConfig.value.global.minEvents;
    for (let i = 0; i < needed; i++) {
        for (const [tag, weight] of Object.entries(tags)) addContribution([tag], weight);
    }
}

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

describe("globalContributionStore", () => {
    beforeEach(() => {
        localStorage.clear();
        changeRequest.mockReset();
        changeRequest.mockResolvedValue({ ack: AckStatus.Accepted });
        grantContribute();
        globalAffinityMemberOf.value = ["group-super-admins", "group-public-content"];
    });

    afterEach(() => {
        localStorage.clear();
        accessMap.value = {} as any;
    });

    describe("accumulation", () => {
        it("accumulates event weights per tag without any network call", () => {
            addContribution(["tag-a"], 0.0035);
            addContribution(["tag-a"], 0.0025);
            addContribution(["tag-b"], 0.0035);

            expect(stored().tags["tag-a"]).toBeCloseTo(0.006, 10);
            expect(stored().tags["tag-b"]).toBeCloseTo(0.0035, 10);
            expect(stored().events).toBe(3);
            expect(changeRequest).not.toHaveBeenCalled();
        });

        it("keeps negative signals negative", () => {
            addContribution(["tag-a"], -0.0002);
            expect(stored().tags["tag-a"]).toBeLessThan(0);
        });

        it("ignores empty tag lists and zero/non-finite weights", () => {
            addContribution(undefined, 0.0035);
            addContribution([], 0.0035);
            addContribution(["tag-a"], 0);
            addContribution(["tag-a"], NaN);

            expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        });

        it("caps the tracked tags, dropping the weakest", () => {
            const original = affinityConfig.value;
            affinityConfig.value = {
                ...original,
                global: { ...original.global, maxTags: 3 },
            };

            for (let i = 0; i < 10; i++) addContribution([`tag-${i}`], 0.001 * (i + 1));

            expect(Object.keys(stored().tags)).toHaveLength(3);
            expect(stored().tags["tag-9"]).toBeDefined();
            expect(stored().tags["tag-0"]).toBeUndefined();

            affinityConfig.value = original;
        });
    });

    describe("gating", () => {
        it("sends nothing before minEvents is reached", async () => {
            addContribution(["tag-a"], 0.0035);
            await maybeFlush();

            expect(changeRequest).not.toHaveBeenCalled();
        });

        it("sends nothing without the Contribute permission — the shipped default", async () => {
            revokeContribute();
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(changeRequest).not.toHaveBeenCalled();
            // The evidence is kept, so granting the permission later still counts it.
            expect(stored().events).toBeGreaterThan(0);
        });

        it("sends nothing again within intervalHours of a successful send", async () => {
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();
            expect(changeRequest).toHaveBeenCalledTimes(1);

            recordEnoughEvents({ "tag-b": 0.0035 });
            await maybeFlush();
            expect(changeRequest).toHaveBeenCalledTimes(1);
        });
    });

    describe("sending", () => {
        it("sends a unit-L1 contribution on the singleton id", async () => {
            addContribution(["tag-a"], 3);
            recordEnoughEvents({ "tag-b": 1 });
            await maybeFlush();

            const doc = changeRequest.mock.calls[0][0].doc;
            expect(doc._id).toBe("global-affinity");
            expect(doc.type).toBe(DocType.GlobalAffinity);

            const total = Object.values(doc.contribution as Record<string, number>).reduce(
                (sum, v) => sum + Math.abs(v),
                0,
            );
            expect(total).toBeCloseTo(1, 10);
        });

        it("sends the singleton's groups — the DTO rejects an empty memberOf", async () => {
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(changeRequest.mock.calls[0][0].doc.memberOf).toEqual([
                "group-super-admins",
                "group-public-content",
            ]);
        });

        it("holds the contribution until the singleton has synced", async () => {
            const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
            globalAffinityMemberOf.value = [];
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(changeRequest).not.toHaveBeenCalled();
            expect(stored().events).toBeGreaterThan(0);
            debug.mockRestore();
        });

        it("never sends an affinity map — that field is server-owned", async () => {
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(changeRequest.mock.calls[0][0].doc.affinity).toEqual({});
        });

        it("clears the pending contribution once accepted", async () => {
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(stored().tags).toEqual({});
            expect(stored().events).toBe(0);
            expect(stored().lastSentUtc).toBeGreaterThan(0);
        });

        it("keeps the pending contribution when the server rejects it", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            changeRequest.mockResolvedValue({ ack: AckStatus.Rejected, message: "No access" });
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(stored().tags["tag-a"]).toBeGreaterThan(0);
            expect(stored().lastSentUtc).toBe(0);
            warn.mockRestore();
        });

        it("warns on rejection — a retry loop with no signal is how this sits dead", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            changeRequest.mockResolvedValue({
                ack: AckStatus.Rejected,
                message: "Global affinity document does not exist",
            });
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining("Global affinity document does not exist"),
            );
            warn.mockRestore();
        });

        it("keeps the pending contribution when the request throws", async () => {
            changeRequest.mockRejectedValue(new Error("offline"));
            recordEnoughEvents({ "tag-a": 0.0035 });
            await maybeFlush();

            expect(stored().tags["tag-a"]).toBeGreaterThan(0);
        });
    });
});
