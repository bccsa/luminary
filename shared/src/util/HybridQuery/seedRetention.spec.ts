import { describe, expect, it } from "vitest";

import { SeedRetention } from "./seedRetention";

describe("SeedRetention", () => {
    describe("initial state", () => {
        it("reports no retention, no retirement, no deferred drop, no remote drop", () => {
            const r = new SeedRetention();
            expect(r.localReadMode(0, true)).toBe("replace");
            expect(r.shouldRetireLocal()).toBe(false);
            expect(r.takeDeferredRemoteDrop()).toBe(false);
            expect(r.takeRemoteDrop()).toBeUndefined();
        });
    });

    describe("recordSeed", () => {
        it("retains an empty local read while remote is pending", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(0, true)).toBe("retain");
        });

        it("does not retain when the local read is itself empty and unseeded", () => {
            const r = new SeedRetention();
            r.recordSeed(0, ["a", "b"]);
            expect(r.localReadMode(0, true)).toBe("replace");
        });

        it("does not retain when the remote leg has already settled", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(0, false)).toBe("replace");
        });

        it("does not retain when the authoritative local read is non-empty", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(5, true)).toBe("replace");
        });

        it("retains an empty local read while the local corpus is still filling", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            // No remote leg is owed, so the seed's only protection is the unsettled corpus.
            expect(r.localReadMode(0, false, false)).toBe("retain");
        });

        it("publishes an empty local read once the corpus has settled", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(0, false, true)).toBe("replace");
        });

        it("merges a partial read over the seed while the corpus is still filling", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            // Sync fills the local store one batch at a time; replacing the seeded window with
            // the first batch is exactly the collapse the seed exists to prevent.
            expect(r.localReadMode(5, false, false)).toBe("merge");
        });

        it("replaces wholesale once the corpus has settled, so deletions propagate", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(5, false, true)).toBe("replace");
        });

        it("treats the corpus as settled when the caller tracks no completeness", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.localReadMode(0, false)).toBe("replace");
        });

        it("leaves remoteFromSeed false for an empty remoteIds array", () => {
            const r = new SeedRetention();
            r.recordSeed(3, []);
            expect(r.takeRemoteDrop()).toBeUndefined();
            expect(r.recordRemoteAnswer()).toBeUndefined();
        });
    });

    describe("releaseLocal", () => {
        it("clears the local seed so a later read replaces wholesale", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a"]);
            expect(r.localReadMode(0, true)).toBe("retain");
            r.releaseLocal();
            expect(r.localReadMode(0, true)).toBe("replace");
        });
    });

    describe("deferRemoteDrop / takeDeferredRemoteDrop", () => {
        it("returns true once then false on the next call (take-once)", () => {
            const r = new SeedRetention();
            r.deferRemoteDrop();
            expect(r.takeDeferredRemoteDrop()).toBe(true);
            expect(r.takeDeferredRemoteDrop()).toBe(false);
        });
    });

    describe("recordRemoteAnswer", () => {
        it("returns the seeded id set on the first call and undefined on a second", () => {
            const r = new SeedRetention();
            r.recordSeed(0, ["b", "a", "c"]);
            const first = r.recordRemoteAnswer();
            expect(Array.from(first!).sort()).toEqual(["a", "b", "c"]);
            expect(r.recordRemoteAnswer()).toBeUndefined();
        });

        it("makes shouldRetireLocal true when a local seed is present", () => {
            const r = new SeedRetention();
            r.recordSeed(2, ["a"]);
            expect(r.shouldRetireLocal()).toBe(false);
            r.recordRemoteAnswer();
            expect(r.shouldRetireLocal()).toBe(true);
        });

        it("keeps shouldRetireLocal false before an answer even with a local seed", () => {
            const r = new SeedRetention();
            r.recordSeed(2, ["a"]);
            // The offline/failure case: the leg settled without a genuine answer.
            expect(r.shouldRetireLocal()).toBe(false);
        });
    });

    describe("takeRemoteDrop", () => {
        it("returns the seeded ids, clears the local seed, and is undefined on a second call", () => {
            const r = new SeedRetention();
            r.recordSeed(2, ["b", "a"]);
            const dropped = r.takeRemoteDrop();
            expect(Array.from(dropped!).sort()).toEqual(["a", "b"]);
            // The local seed is cleared alongside the remote drop.
            expect(r.localReadMode(0, true)).toBe("replace");
            expect(r.takeRemoteDrop()).toBeUndefined();
        });

        it("returns undefined and leaves a present local seed intact (early return)", () => {
            const r = new SeedRetention();
            r.recordSeed(2, []); // no seeded remote, but a seeded local
            expect(r.takeRemoteDrop()).toBeUndefined();
            // The early return must not touch the local flag.
            expect(r.localReadMode(0, true)).toBe("retain");
        });
    });

    describe("holdsSeed", () => {
        it("is false on a fresh instance", () => {
            const r = new SeedRetention();
            expect(r.holdsSeed()).toBe(false);
        });

        it("is true while the local contribution is seeded", () => {
            const r = new SeedRetention();
            r.recordSeed(3, []);
            expect(r.holdsSeed()).toBe(true);
            r.releaseLocal();
            expect(r.holdsSeed()).toBe(false);
        });

        it("is true while the remote contribution is seeded", () => {
            const r = new SeedRetention();
            r.recordSeed(0, ["a"]);
            expect(r.holdsSeed()).toBe(true);
            r.recordRemoteAnswer();
            expect(r.holdsSeed()).toBe(false);
        });

        it("stays true for the untouched side after only one side retires", () => {
            const r = new SeedRetention();
            r.recordSeed(2, ["a"]);
            r.releaseLocal();
            // Local retired, remote still seeded.
            expect(r.holdsSeed()).toBe(true);
        });

        it("is false again after reset", () => {
            const r = new SeedRetention();
            r.recordSeed(2, ["a"]);
            r.reset();
            expect(r.holdsSeed()).toBe(false);
        });
    });

    describe("reset", () => {
        it("returns every accessor to its initial answer", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            r.deferRemoteDrop();
            r.recordRemoteAnswer();

            r.reset();

            expect(r.localReadMode(0, true)).toBe("replace");
            expect(r.shouldRetireLocal()).toBe(false);
            expect(r.takeDeferredRemoteDrop()).toBe(false);
            expect(r.takeRemoteDrop()).toBeUndefined();
        });
    });
});
