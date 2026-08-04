import { describe, it, expect } from "vitest";
import { chainFor, queueOnChain, releaseSsrChain } from "./ssrChains";

describe("ssrChains", () => {
    it("resolves immediately for a route with no queued chain", async () => {
        await expect(chainFor("/never-queued")).resolves.toBeUndefined();
    });

    it("returns the queued promise for a route once one is set", async () => {
        const queued = Promise.resolve("done");
        queueOnChain("/route-a", queued);
        // The stored tail only swallows a rejection; a fulfilled value passes through.
        await expect(chainFor("/route-a")).resolves.toBe("done");
    });

    it("resets a route back to the resolved-promise default after release", async () => {
        queueOnChain("/route-b", Promise.resolve("done"));
        releaseSsrChain("/route-b");
        await expect(chainFor("/route-b")).resolves.toBeUndefined();
    });

    it("keeps routes independent of one another", async () => {
        queueOnChain("/route-c", Promise.resolve("a"));
        queueOnChain("/route-d", Promise.resolve("b"));

        await expect(chainFor("/route-c")).resolves.toBe("a");
        await expect(chainFor("/route-d")).resolves.toBe("b");

        releaseSsrChain("/route-c");
        await expect(chainFor("/route-d")).resolves.toBe("b");
    });

    it("does not poison the chain when a queued promise rejects", async () => {
        const rejected = Promise.reject(new Error("boom"));
        queueOnChain("/poisoned", rejected);

        // The tail stored on the chain swallows the rejection, so the next
        // query sequences after it and runs regardless.
        await expect(chainFor("/poisoned")).resolves.toBeUndefined();
    });

    it("lets a later query run after a rejected earlier one on the same route", async () => {
        const rejected = Promise.reject(new Error("first-failed"));
        queueOnChain("/recovery", rejected);

        const ran: string[] = [];
        const next = chainFor("/recovery").then(() => ran.push("second"));
        queueOnChain("/recovery", next);
        await next;

        expect(ran).toEqual(["second"]);
    });
});