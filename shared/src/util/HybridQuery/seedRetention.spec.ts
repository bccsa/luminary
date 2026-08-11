import { describe, expect, it } from "vitest";

import { SeedRetention } from "./seedRetention";

describe("SeedRetention", () => {
    describe("initial state", () => {
        it("reports no retention, no retirement, no deferred drop, no remote drop", () => {
            const r = new SeedRetention();
            expect(r.shouldRetainLocal(0, true)).toBe(false);
            expect(r.shouldRetireLocal()).toBe(false);
            expect(r.takeDeferredRemoteDrop()).toBe(false);
            expect(r.takeRemoteDrop()).toBeUndefined();
        });
    });

    describe("recordSeed", () => {
        it("retains an empty local read while remote is pending", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.shouldRetainLocal(0, true)).toBe(true);
        });

        it("does not retain when the local read is itself empty and unseeded", () => {
            const r = new SeedRetention();
            r.recordSeed(0, ["a", "b"]);
            expect(r.shouldRetainLocal(0, true)).toBe(false);
        });

        it("does not retain when the remote leg has already settled", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.shouldRetainLocal(0, false)).toBe(false);
        });

        it("does not retain when the authoritative local read is non-empty", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a", "b"]);
            expect(r.shouldRetainLocal(5, true)).toBe(false);
        });

        it("leaves remoteFromSeed false for an empty remoteIds array", () => {
            const r = new SeedRetention();
            r.recordSeed(3, []);
            expect(r.takeRemoteDrop()).toBeUndefined();
            expect(r.recordRemoteAnswer()).toBeUndefined();
        });
    });

    describe("releaseLocal", () => {
        it("clears the local seed so shouldRetainLocal is false afterwards", () => {
            const r = new SeedRetention();
            r.recordSeed(3, ["a"]);
            expect(r.shouldRetainLocal(0, true)).toBe(true);
            r.releaseLocal();
            expect(r.shouldRetainLocal(0, true)).toBe(false);
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
            expect(r.shouldRetainLocal(0, true)).toBe(false);
            expect(r.takeRemoteDrop()).toBeUndefined();
        });

        it("returns undefined and leaves a present local seed intact (early return)", () => {
            const r = new SeedRetention();
            r.recordSeed(2, []); // no seeded remote, but a seeded local
            expect(r.takeRemoteDrop()).toBeUndefined();
            // The early return must not touch the local flag.
            expect(r.shouldRetainLocal(0, true)).toBe(true);
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

            expect(r.shouldRetainLocal(0, true)).toBe(false);
            expect(r.shouldRetireLocal()).toBe(false);
            expect(r.takeDeferredRemoteDrop()).toBe(false);
            expect(r.takeRemoteDrop()).toBeUndefined();
        });
    });
});
