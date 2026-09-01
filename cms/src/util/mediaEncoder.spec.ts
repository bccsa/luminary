import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "crypto";
import {
    unmaskKeyHex,
    browserCanReachEncoder,
    checkEncoderHealth,
    createEncoderSession,
    fetchEncoderSessionKey,
    fetchEncoderSessionStatus,
    forgetEncoderSession,
    recallEncoderSession,
    rememberEncoderSession,
} from "./mediaEncoder";

/** The masking the encoder applies, computed here independently of the code under test. */
function maskKey(sessionId: string, keyHex: string): string {
    const mask = createHash("sha256").update(sessionId).digest().subarray(0, 16);
    const key = Buffer.from(keyHex, "hex");
    return Buffer.from(key.map((byte, i) => byte ^ mask[i % mask.length])).toString("hex");
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("unmaskKeyHex", () => {
    // Shared test vector — the same (seed, key) → masked literal is asserted in
    // api/src/util/maskKey.spec.ts (maskKeyHex) and shared/src/util/unmaskKeyHex.spec.ts.
    // A divergence between the implementations fails a test here rather than a video
    // in the player.
    it("matches the shared test vector", async () => {
        const seed = "sidecar-post-abc-hlsEncryptionKey";
        const keyHex = "000102030405060708090a0b0c0d0e0f";

        expect(maskKey(seed, keyHex)).toBe("98ceb55553113bf2fdd5a74b3fa6e8d8");
        expect(await unmaskKeyHex(seed, "98ceb55553113bf2fdd5a74b3fa6e8d8")).toBe(keyHex);
    });

    it("recovers a key masked with SHA-256(sessionId)[0..15]", async () => {
        const sessionId = "abc123";
        const keyHex = "000102030405060708090a0b0c0d0e0f";

        expect(await unmaskKeyHex(sessionId, maskKey(sessionId, keyHex))).toBe(keyHex);
    });

    it("is its own inverse, so masking twice returns the input", async () => {
        const sessionId = "session-xyz";
        const keyHex = "ffeeddccbbaa99887766554433221100";

        const once = await unmaskKeyHex(sessionId, keyHex);
        expect(await unmaskKeyHex(sessionId, once)).toBe(keyHex);
    });

    it("produces a different key for a different session, so keys cannot be crossed", async () => {
        const keyHex = "0f0e0d0c0b0a09080706050403020100";
        const masked = maskKey("session-a", keyHex);

        expect(await unmaskKeyHex("session-b", masked)).not.toBe(keyHex);
    });

    it("returns 16 bytes for a 16-byte key", async () => {
        const keyHex = "112233445566778899aabbccddeeff00";

        expect(await unmaskKeyHex("s", maskKey("s", keyHex))).toHaveLength(32);
    });
});

describe("checkEncoderHealth", () => {
    it("reports available with the version when the encoder answers", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ status: "ok", apiVersion: "0.0.1" }),
            }),
        );

        expect(await checkEncoderHealth()).toEqual({ available: true, apiVersion: "0.0.1" });
    });

    it("reports unavailable rather than throwing when nothing is listening", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        expect(await checkEncoderHealth()).toEqual({ available: false });
    });

    it("reports unavailable when something else is on the port", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "nope" }) }),
        );

        expect(await checkEncoderHealth()).toEqual({ available: false, apiVersion: undefined });
    });
});

describe("createEncoderSession", () => {
    it("posts the session and returns the encoder's response", async () => {
        const response = {
            sessionId: "s1",
            readToken: "read_1",
            eventsUrl: "http://127.0.0.1:31711/api/sessions/s1/events?token=read_1",
            apiVersion: "0.0.1",
            reused: false,
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify(response),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await createEncoderSession({
            documentId: "post-1",
            title: "Episode 12",
            s3: { endPoint: "minio.local", bucket: "media", accessKey: "a", secretKey: "b" },
            publicBaseUrl: "https://cdn.example.com/media",
        });

        expect(result).toEqual(response);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://127.0.0.1:31711/api/cms/sessions");
        expect(JSON.parse(init.body).documentId).toBe("post-1");
    });

    it("surfaces a refusal, which includes the user declining the trust prompt", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" }),
        );

        await expect(
            createEncoderSession({
                documentId: "post-1",
                title: "t",
                s3: { endPoint: "e", bucket: "b", accessKey: "a", secretKey: "s" },
                publicBaseUrl: "https://cdn.example.com",
            }),
        ).rejects.toThrow(/403/);
    });

    it("names the trust prompt, which a bare status code leaves the editor guessing at", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" }),
        );

        await expect(
            createEncoderSession({
                documentId: "post-1",
                title: "t",
                s3: { endPoint: "e", bucket: "b", accessKey: "a", secretKey: "s" },
                publicBaseUrl: "https://cdn.example.com",
            }),
        ).rejects.toThrow(/Accept the prompt/);
    });
});

describe("fetchEncoderSessionKey", () => {
    it("returns the unmasked key", async () => {
        const sessionId = "s1";
        const keyHex = "0123456789abcdef0123456789abcdef";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ maskedKeyHex: maskKey(sessionId, keyHex) }),
            }),
        );

        expect(await fetchEncoderSessionKey(sessionId, "read_1")).toBe(keyHex);
    });

    it("returns undefined for an unencrypted session, which answers 404", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

        expect(await fetchEncoderSessionKey("s1", "read_1")).toBeUndefined();
    });
});

describe("browserCanReachEncoder", () => {
    it("accepts Chromium, which is what implements the loopback grant", () => {
        vi.stubGlobal("navigator", { userAgentData: { brands: [{ brand: "Chromium" }] } });

        expect(browserCanReachEncoder()).toBe(true);
    });

    it("rejects a browser with no Chromium brand", () => {
        vi.stubGlobal("navigator", { userAgentData: { brands: [{ brand: "WebKit" }] } });

        expect(browserCanReachEncoder()).toBe(false);
    });

    it("accepts desktop Chrome by user agent when the brands are absent", () => {
        vi.stubGlobal("navigator", {
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        });

        expect(browserCanReachEncoder()).toBe(true);
    });

    it("rejects Safari", () => {
        vi.stubGlobal("navigator", {
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
                "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        });

        expect(browserCanReachEncoder()).toBe(false);
    });

    it("rejects Chrome on iOS, which is WebKit under a Chromium name", () => {
        vi.stubGlobal("navigator", {
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
                "(KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1",
        });

        expect(browserCanReachEncoder()).toBe(false);
    });
});

describe("fetchEncoderSessionStatus", () => {
    it("reads the session, so a page arriving mid-encode knows where it is", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ sessionId: "s1", status: "encoding", progress: 42 }),
        });
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchEncoderSessionStatus("s1", "read_1")).toEqual({
            sessionId: "s1",
            status: "encoding",
            progress: 42,
        });
        expect(fetchMock.mock.calls[0][0]).toContain("/api/sessions/s1?token=read_1");
    });

    it("returns undefined when the encoder no longer holds the session", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

        expect(await fetchEncoderSessionStatus("s1", "read_1")).toBeUndefined();
    });

    it("returns undefined rather than throwing when the encoder is gone", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        expect(await fetchEncoderSessionStatus("s1", "read_1")).toBeUndefined();
    });
});

describe("the stored session handle", () => {
    const handle = {
        sessionId: "s1",
        readToken: "read_1",
        eventsUrl: "http://127.0.0.1:31711/api/sessions/s1/events?token=read_1",
    };

    afterEach(() => localStorage.clear());

    it("survives the reload it exists for", () => {
        rememberEncoderSession("post-1", handle);

        expect(recallEncoderSession("post-1")).toEqual(handle);
    });

    it("is scoped to its document, so one post cannot follow another's encode", () => {
        rememberEncoderSession("post-1", handle);

        expect(recallEncoderSession("post-2")).toBeUndefined();
    });

    it("is gone once forgotten", () => {
        rememberEncoderSession("post-1", handle);
        forgetEncoderSession("post-1");

        expect(recallEncoderSession("post-1")).toBeUndefined();
    });

    it("ignores a half-written handle rather than following an unusable one", () => {
        localStorage.setItem("cms_encoderSession_post-1", JSON.stringify({ sessionId: "s1" }));

        expect(recallEncoderSession("post-1")).toBeUndefined();
    });

    it("ignores unparseable storage", () => {
        localStorage.setItem("cms_encoderSession_post-1", "not json");

        expect(recallEncoderSession("post-1")).toBeUndefined();
    });
});
