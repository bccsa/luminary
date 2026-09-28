import { describe, expect, it, vi } from "vitest";
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { QueryCapabilities } from "./contracts";
import { planCoveredQuery, resolveQueryOnce } from "./renderQuery";

const doc = (id: string) => ({ _id: id, updatedTimeUtc: 1, type: "content" }) as BaseDocumentDto;
const query = { selector: { type: "content" } } as MangoQuery;

/** A build environment: two reads, nothing else. No coverage, persistence or live sources. */
function buildCapabilities(
    local: { docs: BaseDocumentDto[]; covered: boolean } | null,
    remote: BaseDocumentDto[] | Error = [],
): QueryCapabilities<BaseDocumentDto> {
    return {
        plan: (q) => planCoveredQuery(q, local !== null),
        sources: {
            readLocal: vi.fn().mockResolvedValue(local ?? { docs: [], covered: false }),
            readRemote: vi.fn(() =>
                remote instanceof Error ? Promise.reject(remote) : Promise.resolve(remote),
            ),
        },
    };
}

describe("resolveQueryOnce — build/render composition", () => {
    it("composes from two reads alone: no coverage, persistence, sockets or connectivity", async () => {
        const capabilities = buildCapabilities({ docs: [doc("a")], covered: true });
        await expect(resolveQueryOnce(query, capabilities)).resolves.toEqual([doc("a")]);
    });

    it("treats a COVERED EMPTY local result as authoritative and never falls back remotely", async () => {
        const capabilities = buildCapabilities({ docs: [], covered: true }, [doc("from-api")]);
        await expect(resolveQueryOnce(query, capabilities)).resolves.toEqual([]);
        expect(capabilities.sources.readRemote).not.toHaveBeenCalled();
    });

    it("falls back remotely when the local source cannot cover the query", async () => {
        const capabilities = buildCapabilities({ docs: [], covered: false }, [doc("from-api")]);
        await expect(resolveQueryOnce(query, capabilities)).resolves.toEqual([doc("from-api")]);
        expect(capabilities.sources.readRemote).toHaveBeenCalledTimes(1);
    });

    it("is remote-only when the caller declares the query outside the local domain", async () => {
        const capabilities = buildCapabilities(null, [doc("from-api")]);
        await expect(resolveQueryOnce(query, capabilities)).resolves.toEqual([doc("from-api")]);
        expect(capabilities.sources.readLocal).not.toHaveBeenCalled();
    });

    it("rejects on a failed remote read rather than resolving an empty window", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const capabilities = buildCapabilities(null, new Error("HTTP 500"));
        await expect(resolveQueryOnce(query, capabilities)).rejects.toThrow("HTTP 500");
        vi.restoreAllMocks();
    });

    it("resolves empty for a provably-empty selector without reading any source", async () => {
        const capabilities = buildCapabilities({ docs: [doc("a")], covered: true });
        const empty = { selector: { type: "content", _id: { $in: [] } } } as MangoQuery;
        await expect(resolveQueryOnce(empty, capabilities)).resolves.toEqual([]);
        expect(capabilities.sources.readLocal).not.toHaveBeenCalled();
        expect(capabilities.sources.readRemote).not.toHaveBeenCalled();
    });

    it("applies stripFields to the resolved window", async () => {
        const heavy = { ...doc("a"), text: "body" };
        const capabilities = buildCapabilities({ docs: [heavy], covered: true });
        const out = await resolveQueryOnce(query, capabilities, { stripFields: ["text"] });
        expect(out[0]).not.toHaveProperty("text");
        expect(out[0]._id).toBe("a");
    });
});
