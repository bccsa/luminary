import { describe, it, expect } from "vitest";
import { chainFor, queueOnChain, releaseSsrChain } from "./ssrChains";

describe("ssrChains", () => {
    it("resolves immediately for a route with no queued chain", async () => {
        await expect(chainFor("/never-queued")).resolves.toBeUndefined();
    });

    it("returns the queued promise for a route once one is set", async () => {
        const queued = Promise.resolve("done");
        queueOnChain("/route-a", queued);
        expect(chainFor("/route-a")).toBe(queued);
    });

    it("resets a route back to the resolved-promise default after release", async () => {
        queueOnChain("/route-b", Promise.resolve("done"));
        releaseSsrChain("/route-b");
        await expect(chainFor("/route-b")).resolves.toBeUndefined();
    });

    it("keeps routes independent of one another", () => {
        const queuedA = Promise.resolve("a");
        const queuedB = Promise.resolve("b");
        queueOnChain("/route-c", queuedA);
        queueOnChain("/route-d", queuedB);

        expect(chainFor("/route-c")).toBe(queuedA);
        expect(chainFor("/route-d")).toBe(queuedB);

        releaseSsrChain("/route-c");
        expect(chainFor("/route-d")).toBe(queuedB);
    });
});
