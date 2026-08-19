import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * One assertion, on the value that was wrong for months.
 *
 * `encryption: { required: … }` was switched off while the app played HLS with
 * hls.js, which cannot read LMCENC playlists. Nothing pinned it, so the switch
 * outlived its reason: the player gained a decryption layer and the CMS carried
 * on asking for plaintext output, leaving the whole key path — sidecars, masking,
 * `GET /sidecar` — unused in production.
 *
 * A test rather than a comment, because a comment is what it had.
 */
const createEncoderSessionMock = vi.hoisted(() => vi.fn());
const getEncoderConfigMock = vi.hoisted(() => vi.fn());

vi.mock("@/util/mediaEncoder", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/util/mediaEncoder")>()),
    createEncoderSession: createEncoderSessionMock,
    checkEncoderHealth: vi.fn().mockResolvedValue({ available: true, apiVersion: "0.0.1" }),
    subscribeToEncoderSession: vi.fn(() => vi.fn()),
}));

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getEncoderConfig: getEncoderConfigMock }),
}));

import { useMediaEncoder } from "./useMediaEncoder";

beforeEach(() => {
    vi.clearAllMocks();
    getEncoderConfigMock.mockResolvedValue({
        s3: { endPoint: "s3.example.com", bucket: "media" },
        publicBaseUrl: "https://cdn.example.com/media",
    });
    // Never resolves further; the assertion is about what was requested.
    createEncoderSessionMock.mockResolvedValue({ sessionId: "s1", readToken: "r1" });
});

describe("useMediaEncoder", () => {
    it("asks the encoder to encrypt", async () => {
        const { start } = useMediaEncoder();

        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        }).catch(() => {
            // The session opens an event stream this test does not drive; only the
            // request shape matters here.
        });

        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ encryption: { required: true } }),
        );
    });
});
