import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchHlsKey, fetchHlsKeyOutcome } from "./hlsKey";

const getSidecarMock = vi.hoisted(() => vi.fn());
const getSidecarWithStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../api/RestApi", () => ({
    getRest: () => ({
        getSidecar: getSidecarMock,
        getSidecarWithStatus: getSidecarWithStatusMock,
    }),
}));

// Real (seed, masked) → key vector shared with api/src/util/maskKey.spec.ts and
// ./unmaskKeyHex.spec.ts, so a divergence fails here rather than in a player.
const SIDECAR_ID = "sidecar-post-abc-hlsEncryptionKey";
const MASKED_KEY_HEX = "98ceb55553113bf2fdd5a74b3fa6e8d8";
const KEY_HEX = "000102030405060708090a0b0c0d0e0f";

const sidecar = (data: unknown) => ({
    sidecarId: SIDECAR_ID,
    parentId: "post-1",
    sidecarType: "hlsEncryptionKey",
    data,
});

beforeEach(() => {
    getSidecarMock.mockReset();
    getSidecarWithStatusMock.mockReset();
});

describe("fetchHlsKey", () => {
    it("asks for the parent's key sidecar and unmasks what comes back", async () => {
        getSidecarMock.mockResolvedValue(sidecar({ maskedKeyHex: MASKED_KEY_HEX }));

        expect(await fetchHlsKey("post-1")).toBe(KEY_HEX);
        expect(getSidecarMock).toHaveBeenCalledWith("post-1", "hlsEncryptionKey", {});
    });

    it("passes the CMS flag through, which is what exempts an editor from publish gating", async () => {
        getSidecarMock.mockResolvedValue(sidecar({ maskedKeyHex: MASKED_KEY_HEX }));

        await fetchHlsKey("post-1", { cms: true });

        expect(getSidecarMock).toHaveBeenCalledWith("post-1", "hlsEncryptionKey", { cms: true });
    });

    it("answers undefined when there is no sidecar to use", async () => {
        getSidecarMock.mockResolvedValue(undefined);

        expect(await fetchHlsKey("post-1")).toBeUndefined();
    });

    it("answers undefined for a payload without a key, rather than an unmasked garbage string", async () => {
        getSidecarMock.mockResolvedValue(sidecar({}));

        expect(await fetchHlsKey("post-1")).toBeUndefined();
    });
});

describe("fetchHlsKeyOutcome", () => {
    const respond = (status: number, body?: unknown) =>
        getSidecarWithStatusMock.mockResolvedValue({ status, body });

    it("unmasks the key from a 200", async () => {
        respond(200, sidecar({ maskedKeyHex: MASKED_KEY_HEX }));

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "key", keyHex: KEY_HEX });
        expect(getSidecarWithStatusMock).toHaveBeenCalledWith("post-1", "hlsEncryptionKey", {});
    });

    it("passes the CMS flag through", async () => {
        respond(200, sidecar({ maskedKeyHex: MASKED_KEY_HEX }));

        await fetchHlsKeyOutcome("post-1", { cms: true });

        expect(getSidecarWithStatusMock).toHaveBeenCalledWith("post-1", "hlsEncryptionKey", {
            cms: true,
        });
    });

    it("reads the endpoint's own 404 as denied", async () => {
        respond(404, { statusCode: 404, message: "Not found" });

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "denied" });
    });

    it("reads a 403 the API answered as denied", async () => {
        respond(403, { statusCode: 403, message: "Forbidden" });

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "denied" });
    });

    // Something in front of the API (proxy, WAF, captive portal) or a missing route can answer
    // 403 or 404 too; only the endpoint's own refusal is affirmative.
    it.each([
        ["a 403 with no body", 403, undefined],
        ["a 404 with no body", 404, undefined],
        ["a 403 with a null body", 403, null],
        ["a 403 with a non-API body", 403, { error: "blocked" }],
        ["a 404 with a non-API body", 404, { message: "Not found" }],
        ["a 404 whose statusCode disagrees", 404, { statusCode: 502, message: "Not found" }],
        ["a 404 for an unknown route", 404, { statusCode: 404, message: "Cannot GET /sidecar" }],
    ])("reads %s as unreachable", async (_label, status, body) => {
        respond(status, body);

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "unreachable" });
    });

    it("reads a 429 as rate limited", async () => {
        respond(429, { message: "Too many key requests; retry later" });

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "rateLimited" });
    });

    // A caller may destroy a stored key on "denied", so none of these may read as one.
    it.each([
        ["a network failure", 0],
        ["a 401", 401],
        ["a 400", 400],
        ["a corrupt-payload 409", 409],
        ["a 500", 500],
        ["a 502", 502],
        ["a 503", 503],
        ["an unexpected 2xx", 204],
        ["a redirect", 302],
    ])("reads %s as unreachable", async (_label, status) => {
        respond(status);

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "unreachable" });
    });

    it.each([
        ["no body", undefined],
        ["a null body", null],
        ["no data", { sidecarId: SIDECAR_ID }],
        ["no masked key", sidecar({})],
        ["a short masked key", sidecar({ maskedKeyHex: "98ceb555" })],
        ["a non-hex masked key", sidecar({ maskedKeyHex: "z".repeat(32) })],
        ["a non-string masked key", sidecar({ maskedKeyHex: 42 })],
        ["no sidecar id", { data: { maskedKeyHex: MASKED_KEY_HEX } }],
    ])("reads a 200 with %s as unreachable", async (_label, body) => {
        respond(200, body);

        expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "unreachable" });
    });

    it("reads a key that cannot be unmasked as unreachable", async () => {
        respond(200, sidecar({ maskedKeyHex: MASKED_KEY_HEX }));
        vi.stubGlobal("crypto", {});

        try {
            expect(await fetchHlsKeyOutcome("post-1")).toEqual({ outcome: "unreachable" });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
