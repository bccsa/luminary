import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchHlsKey } from "./hlsKey";

const getSidecarMock = vi.hoisted(() => vi.fn());

vi.mock("../api/RestApi", () => ({ getRest: () => ({ getSidecar: getSidecarMock }) }));

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
