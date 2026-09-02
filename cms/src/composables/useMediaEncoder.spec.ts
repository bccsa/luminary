import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const checkEncoderHealthMock = vi.hoisted(() => vi.fn());
const fetchEncoderSessionStatusMock = vi.hoisted(() => vi.fn());
const fetchEncoderSessionKeyMock = vi.hoisted(() => vi.fn());
const subscribeMock = vi.hoisted(() => vi.fn(() => vi.fn()));

// The handle store is left real: it is the thing a reload depends on, and jsdom
// gives it the localStorage it needs.
vi.mock("@/util/mediaEncoder", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/util/mediaEncoder")>()),
    createEncoderSession: createEncoderSessionMock,
    checkEncoderHealth: checkEncoderHealthMock,
    fetchEncoderSessionStatus: fetchEncoderSessionStatusMock,
    fetchEncoderSessionKey: fetchEncoderSessionKeyMock,
    subscribeToEncoderSession: subscribeMock,
}));

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getEncoderConfig: getEncoderConfigMock }),
}));

import { useMediaEncoder } from "./useMediaEncoder";

const EVENTS_URL = "http://127.0.0.1:31711/api/sessions/s1/events?token=r1";

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getEncoderConfigMock.mockResolvedValue({
        s3: { endPoint: "s3.example.com", bucket: "media" },
        publicBaseUrl: "https://cdn.example.com/media",
    });
    checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
    fetchEncoderSessionKeyMock.mockResolvedValue("aabbccddeeff00112233445566778899");
    // Never resolves further; the assertion is about what was requested.
    createEncoderSessionMock.mockResolvedValue({
        sessionId: "s1",
        readToken: "r1",
        eventsUrl: EVENTS_URL,
    });
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

/**
 * An encode runs for minutes inside a separate application. Until the composable
 * could pick one back up, a reload left the editor watching nothing while the
 * encoder carried on writing to their document.
 */
describe("useMediaEncoder resume", () => {
    const remember = () =>
        localStorage.setItem(
            "cms_encoderSession_post-1",
            JSON.stringify({ sessionId: "s1", readToken: "r1", eventsUrl: EVENTS_URL }),
        );

    const stored = () => localStorage.getItem("cms_encoderSession_post-1");

    it("stores the handle when an encode starts, which is what makes a reload survivable", async () => {
        const { start } = useMediaEncoder();

        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(JSON.parse(stored()!)).toEqual({
            sessionId: "s1",
            readToken: "r1",
            eventsUrl: EVENTS_URL,
        });
    });

    it("does not go looking when the document has no session", async () => {
        const { resume } = useMediaEncoder();

        expect(await resume({ documentId: "post-1", onMediaReady: vi.fn() })).toBe(false);
        expect(fetchEncoderSessionStatusMock).not.toHaveBeenCalled();
    });

    it("picks up an encode still running, with the progress it has reached", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            status: "encoding",
            progress: 42,
        });

        const { resume, status, progress } = useMediaEncoder();

        expect(await resume({ documentId: "post-1", onMediaReady: vi.fn() })).toBe(true);
        expect(status.value).toBe("encoding");
        expect(progress.value).toBe(42);
        expect(subscribeMock.mock.calls[0][0]).toBe(EVENTS_URL);
    });

    it("writes the URL back, so a reload before the first event does not lose it", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            status: "encoding",
            hlsUrl: "https://cdn.example.com/media/s1/master.m3u8",
        });
        const onMediaReady = vi.fn();

        await useMediaEncoder().resume({ documentId: "post-1", onMediaReady });

        expect(onMediaReady).toHaveBeenCalledWith({
            hlsUrl: "https://cdn.example.com/media/s1/master.m3u8",
            hlsKey: "aabbccddeeff00112233445566778899",
        });
    });

    it("does not follow a finished session, having nothing left to send", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue({ sessionId: "s1", status: "completed" });

        expect(
            await useMediaEncoder().resume({ documentId: "post-1", onMediaReady: vi.fn() }),
        ).toBe(true);
        expect(subscribeMock).not.toHaveBeenCalled();
        expect(stored()).toBeNull();
    });

    it("drops a handle the encoder no longer holds", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue(undefined);

        expect(
            await useMediaEncoder().resume({ documentId: "post-1", onMediaReady: vi.fn() }),
        ).toBe(false);
        expect(stored()).toBeNull();
    });

    it("will not follow a session that belongs to another document", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            status: "encoding",
            documentId: "post-2",
        });

        expect(
            await useMediaEncoder().resume({ documentId: "post-1", onMediaReady: vi.fn() }),
        ).toBe(false);
        expect(subscribeMock).not.toHaveBeenCalled();
        expect(stored()).toBeNull();
    });

    it("keeps the handle when the encoder is merely closed, not gone", async () => {
        remember();
        checkEncoderHealthMock.mockResolvedValue({ available: false });

        expect(
            await useMediaEncoder().resume({ documentId: "post-1", onMediaReady: vi.fn() }),
        ).toBe(false);
        // The session may well still be running behind a closed window.
        expect(stored()).not.toBeNull();
    });
});

describe("useMediaEncoder availability", () => {
    it("blames the browser when it is the reason the encoder cannot be reached", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 ... Version/17.0 Safari/605.1.15" });

        const { availability, refreshAvailability } = useMediaEncoder();
        await refreshAvailability();

        expect(availability.value).toBe("browser-unsupported");
        vi.unstubAllGlobals();
    });

    it("says only that it is not running when the browser is capable", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        vi.stubGlobal("navigator", { userAgentData: { brands: [{ brand: "Chromium" }] } });

        const { availability, refreshAvailability } = useMediaEncoder();
        await refreshAvailability();

        expect(availability.value).toBe("unavailable");
        vi.unstubAllGlobals();
    });

    it("trusts an encoder that answers, whatever the user agent claims", async () => {
        vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Safari/605.1.15" });

        const { availability, refreshAvailability } = useMediaEncoder();
        await refreshAvailability();

        expect(availability.value).toBe("available");
        vi.unstubAllGlobals();
    });
});

/**
 * Nothing tells this page that a desktop app has started. The launch link's one
 * delayed re-check fired before the encoder had finished booting, and did
 * nothing at all for an editor who opened the app from the Dock instead.
 */
describe("useMediaEncoder watching for the encoder", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // jsdom's user agent is not Chromium, which would land every failure on
        // "browser-unsupported". Polling is the same either way; the label is not.
        vi.stubGlobal("navigator", { userAgentData: { brands: [{ brand: "Chromium" }] } });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("keeps looking until the encoder answers", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { availability, refreshAvailability, watchForEncoder } = useMediaEncoder();

        await refreshAvailability();
        expect(availability.value).toBe("unavailable");

        watchForEncoder();
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
        await vi.advanceTimersByTimeAsync(3000);

        expect(availability.value).toBe("available");
    });

    it("stops once it has answered, rather than polling a port forever", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        watchForEncoder();

        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
        await vi.advanceTimersByTimeAsync(3000);
        const callsWhenFound = checkEncoderHealthMock.mock.calls.length;

        await vi.advanceTimersByTimeAsync(30000);

        expect(checkEncoderHealthMock.mock.calls.length).toBe(callsWhenFound);
    });

    it("does not start when the encoder is already there", async () => {
        const { refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        const before = checkEncoderHealthMock.mock.calls.length;

        watchForEncoder();
        await vi.advanceTimersByTimeAsync(30000);

        expect(checkEncoderHealthMock.mock.calls.length).toBe(before);
    });

    it("notices the encoder going away, not only arriving", async () => {
        // The button looking usable on an app that is not there is the same
        // problem as the notice not clearing, in the other direction.
        const { availability, refreshAvailability } = useMediaEncoder();
        await refreshAvailability();
        expect(availability.value).toBe("available");

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);

        expect(availability.value).toBe("unavailable");
    });

    it("starts looking again once it has gone, so the notice recovers by itself", async () => {
        const { availability, refreshAvailability } = useMediaEncoder();
        await refreshAvailability();

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(0);
        expect(availability.value).toBe("unavailable");

        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
        await vi.advanceTimersByTimeAsync(3000);

        expect(availability.value).toBe("available");
    });

    it("leaves a hidden tab alone — nobody there is waiting for a window", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        watchForEncoder();

        const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        const before = checkEncoderHealthMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(9000);

        expect(checkEncoderHealthMock.mock.calls.length).toBe(before);
        hidden.mockRestore();
    });
});
