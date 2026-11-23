import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick, ref } from "vue";

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
const fetchHlsKeyMock = vi.hoisted(() => vi.fn());
const ackEncoderSessionMock = vi.hoisted(() => vi.fn());

// The handle store is left real: it is the thing a reload depends on, and jsdom
// gives it the localStorage it needs.
vi.mock("@/util/mediaEncoder", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/util/mediaEncoder")>()),
    createEncoderSession: createEncoderSessionMock,
    checkEncoderHealth: checkEncoderHealthMock,
    fetchEncoderSessionStatus: fetchEncoderSessionStatusMock,
    fetchEncoderSessionKey: fetchEncoderSessionKeyMock,
    subscribeToEncoderSession: subscribeMock,
    ackEncoderSession: ackEncoderSessionMock,
}));

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getEncoderConfig: getEncoderConfigMock }),
    fetchHlsKey: fetchHlsKeyMock,
}));

import { useMediaEncoder } from "./useMediaEncoder";

const EVENTS_URL = "http://127.0.0.1:31711/api/sessions/s1/events?token=r1";

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getEncoderConfigMock.mockResolvedValue({
        s3: { endPoint: "s3.example.com", bucket: "media" },
        publicBaseUrl: "https://cdn.example.com/media",
        encryption: { required: true },
    });
    checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
    fetchEncoderSessionKeyMock.mockResolvedValue("aabbccddeeff00112233445566778899");
    ackEncoderSessionMock.mockResolvedValue(undefined);
    // Never resolves further; the assertion is about what was requested.
    createEncoderSessionMock.mockResolvedValue({
        sessionId: "s1",
        readToken: "r1",
        eventsUrl: EVENTS_URL,
    });
});

describe("useMediaEncoder", () => {
    it("forwards the bucket's encryption requirement", async () => {
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

    it("forwards the bucket's byte-range settings without knowing what they mean", async () => {
        // The encoderconfig response is shaped as the encoder's session body; a new
        // setting added there must reach the encoder with no change to this page.
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: false },
            byteRange: false,
            byteRangeMaxFileSizeMB: 100,
            audioByteRangeMaxFileSizeMB: 100,
            byteRangeBlockSeconds: 60,
        });
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        const { start } = useMediaEncoder();

        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        }).catch(() => {});

        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                encryption: { required: false },
                byteRange: false,
                byteRangeMaxFileSizeMB: 100,
                audioByteRangeMaxFileSizeMB: 100,
                byteRangeBlockSeconds: 60,
            }),
        );
    });
});

describe("useMediaEncoder with an encoder too old for the bucket's block length", () => {
    // Such an encoder answers 400 to any session body naming the block length.
    beforeEach(() => {
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
            byteRangeBlockSeconds: 60,
        });
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
    });

    it("asks the editor to update instead of opening an encode", async () => {
        const { start, error, needsUpdate } = useMediaEncoder();
        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(createEncoderSessionMock).not.toHaveBeenCalled();
        expect(needsUpdate.value).toBe(true);
        expect(error.value).toBeUndefined();
    });

    it("asks the editor to update instead of opening an edit", async () => {
        const { edit, error, needsUpdate } = useMediaEncoder();
        await edit({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
            onMediaReady: vi.fn(),
        });

        expect(createEncoderSessionMock).not.toHaveBeenCalled();
        expect(needsUpdate.value).toBe(true);
        expect(error.value).toBeUndefined();
    });

    it("still encodes for a bucket without a block length", async () => {
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
        });
        const { start } = useMediaEncoder();
        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(createEncoderSessionMock).toHaveBeenCalled();
    });
    it("encodes for a block length of 0 without naming it, since this encoder packs in arrival order anyway", async () => {
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
            byteRangeBlockSeconds: 0,
        });
        const { start, needsUpdate } = useMediaEncoder();
        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).toHaveBeenCalledTimes(1);
        expect(createEncoderSessionMock.mock.calls[0][0]).not.toHaveProperty(
            "byteRangeBlockSeconds",
        );
    });

    it("forgets the refusal once the encoder has been updated", async () => {
        const { start, needsUpdate } = useMediaEncoder();
        const options = {
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        };
        await start(options);
        expect(needsUpdate.value).toBe(true);

        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        await start(options);

        expect(needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ byteRangeBlockSeconds: 60 }),
        );
    });

    const startOptions = {
        documentId: "post-1",
        title: "Episode 1",
        mediaBucketId: "bucket-1",
        onMediaReady: vi.fn(),
    };

    it("shows the launch notice rather than the update notice while the encoder is closed", async () => {
        const { start, refreshAvailability, availability, needsUpdate } = useMediaEncoder();
        await start(startOptions);
        expect(needsUpdate.value).toBe(true);

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        await refreshAvailability();

        expect(availability.value).not.toBe("available");
        expect(needsUpdate.value).toBe(false);

        // The same old encoder started again still cannot take the encode.
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
        await refreshAvailability();

        expect(needsUpdate.value).toBe(true);
    });

    it("stops asking for an update once the updated encoder is running", async () => {
        const { start, refreshAvailability, needsUpdate } = useMediaEncoder();
        await start(startOptions);

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        await refreshAvailability();
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        await refreshAvailability();

        expect(needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).not.toHaveBeenCalled();
    });

    it("leaves the refusal behind when it resumes another document", async () => {
        const { start, resume, needsUpdate } = useMediaEncoder();
        await start(startOptions);
        expect(needsUpdate.value).toBe(true);

        await resume({ documentId: "post-2", onMediaReady: vi.fn() });

        expect(needsUpdate.value).toBe(false);
    });

    it("leaves the refusal behind when it stops", async () => {
        const { start, stop, needsUpdate } = useMediaEncoder();
        await start(startOptions);

        stop();

        expect(needsUpdate.value).toBe(false);
    });

    it("does not ask for an update while the encoder is closed, whatever version it last reported", async () => {
        const { start, refreshAvailability, needsUpdate } = useMediaEncoder();
        await start(startOptions);
        expect(needsUpdate.value).toBe(true);

        checkEncoderHealthMock.mockResolvedValue({ available: false, apiVersion: "0.0.1" });
        await refreshAvailability();

        expect(needsUpdate.value).toBe(false);
    });

    it("keeps the refusal when a poll picks up the same document's dropped stream", async () => {
        // The session followed is an earlier encode of this document; the encoder that
        // refused the next one is still the one running when its stream comes back.
        getEncoderConfigMock.mockResolvedValueOnce({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
        });
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            documentId: "post-1",
            status: "completed",
        });
        const encoder = useMediaEncoder();
        await encoder.start(startOptions);
        await encoder.start(startOptions);
        expect(createEncoderSessionMock).toHaveBeenCalledTimes(1);
        expect(encoder.needsUpdate.value).toBe(true);

        vi.useFakeTimers();
        try {
            (subscribeMock.mock.calls[0] as any[])[1].onError();
            encoder.watchForEncoder();
            await vi.advanceTimersByTimeAsync(10000);

            expect(subscribeMock).toHaveBeenCalledTimes(2);
            expect(encoder.needsUpdate.value).toBe(true);
        } finally {
            encoder.stop();
            encoder.stopWatching();
            vi.useRealTimers();
        }
    });

    describe("when the caller moves on before the refusal arrives", () => {
        /** Holds the bucket config back until `release` is called. */
        const holdConfig = () => {
            let release!: () => void;
            getEncoderConfigMock.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        release = () =>
                            resolve({
                                s3: { endPoint: "s3.example.com", bucket: "media" },
                                publicBaseUrl: "https://cdn.example.com/media",
                                encryption: { required: true },
                                byteRangeBlockSeconds: 60,
                            });
                    }),
            );
            return () => release();
        };

        it("does not show a start's refusal after a stop", async () => {
            const release = holdConfig();
            const { start, stop, needsUpdate } = useMediaEncoder();
            const pending = start(startOptions);
            await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

            stop();
            release();
            await pending;

            expect(needsUpdate.value).toBe(false);
        });

        it("does not show an edit's refusal against the document resumed meanwhile", async () => {
            const release = holdConfig();
            const { edit, resume, needsUpdate, busy } = useMediaEncoder();
            const pending = edit({
                ...startOptions,
                hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
            });
            await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

            await resume({ documentId: "post-2", onMediaReady: vi.fn() });
            release();
            await pending;

            expect(needsUpdate.value).toBe(false);
            // The edit was overtaken, so it is not left looking in flight.
            expect(busy.value).toBe(false);
        });

        it("does not show an earlier start's refusal once a later one has begun", async () => {
            const release = holdConfig();
            getEncoderConfigMock.mockResolvedValueOnce({
                s3: { endPoint: "s3.example.com", bucket: "media" },
                publicBaseUrl: "https://cdn.example.com/media",
                encryption: { required: true },
            });
            const { start, needsUpdate } = useMediaEncoder();
            const first = start(startOptions);
            await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

            await start({ ...startOptions, documentId: "post-2" });
            release();
            await first;

            expect(needsUpdate.value).toBe(false);
        });

        it("still shows a start's refusal when the page resumes that same document meanwhile", async () => {
            // The page's switch to a document stops, then resumes it once the encoder has
            // answered; an Encode pressed in between is the call that resume must not overtake.
            const { start, stop, resume, needsUpdate } = useMediaEncoder();
            stop();
            const release = holdConfig();
            const pending = start({ ...startOptions, documentId: "post-2" });
            await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

            await resume({ documentId: "post-2", onMediaReady: vi.fn() });
            release();
            await pending;

            expect(needsUpdate.value).toBe(true);
        });
    });
});

describe("useMediaEncoder with a block length of 0", () => {
    beforeEach(() => {
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
            byteRangeBlockSeconds: 0,
        });
    });

    it("sends it to an encoder that knows the field, since 0 turns blocks off", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        const { start } = useMediaEncoder();
        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ byteRangeBlockSeconds: 0 }),
        );
    });

    const editOptions = {
        documentId: "post-1",
        title: "Episode 1",
        mediaBucketId: "bucket-1",
        hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
        onMediaReady: vi.fn(),
    };

    it("opens an edit without naming it for an encoder that does not know the field", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const { edit, needsUpdate } = useMediaEncoder();
        await edit(editOptions);

        expect(needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).toHaveBeenCalledTimes(1);
        expect(createEncoderSessionMock.mock.calls[0][0]).toMatchObject({ mode: "edit" });
        expect(createEncoderSessionMock.mock.calls[0][0]).not.toHaveProperty(
            "byteRangeBlockSeconds",
        );
    });

    it("sends it with an edit to an encoder that knows the field", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        const { edit } = useMediaEncoder();
        await edit(editOptions);

        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "edit", byteRangeBlockSeconds: 0 }),
        );
    });

    it("sends a positive block length with an edit to an encoder that knows the field", async () => {
        getEncoderConfigMock.mockResolvedValue({
            s3: { endPoint: "s3.example.com", bucket: "media" },
            publicBaseUrl: "https://cdn.example.com/media",
            encryption: { required: true },
            byteRangeBlockSeconds: 60,
        });
        fetchHlsKeyMock.mockResolvedValue(undefined);
        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.2" });
        const { edit, needsUpdate } = useMediaEncoder();
        await edit(editOptions);

        expect(needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ mode: "edit", byteRangeBlockSeconds: 60 }),
        );
    });

    it("sends it when the encoder reports no version", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: true });
        const { start } = useMediaEncoder();
        await start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });

        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({ byteRangeBlockSeconds: 0 }),
        );
    });
});

describe("useMediaEncoder editing the existing video", () => {
    const options = {
        documentId: "post-1",
        title: "Episode 1",
        mediaBucketId: "bucket-1",
        hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
        onMediaReady: vi.fn(),
    };

    it("opens it in the encoder with its key, naming the document so the API checks it may be edited", async () => {
        fetchHlsKeyMock.mockResolvedValue("aabbccddeeff00112233445566778899");
        const { edit, error } = useMediaEncoder();
        await edit(options);

        expect(getEncoderConfigMock).toHaveBeenCalledWith("bucket-1", "post-1");
        expect(fetchHlsKeyMock).toHaveBeenCalledWith("post-1", { cms: true });
        expect(createEncoderSessionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                documentId: "post-1",
                mode: "edit",
                existingMedia: {
                    hlsUrl: options.hlsUrl,
                    hlsKey: "aabbccddeeff00112233445566778899",
                },
            }),
        );
        expect(error.value).toBeUndefined();
    });

    it("follows the session and remembers it: each saved edit comes back to the document", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const { edit } = useMediaEncoder();
        await edit({ ...options, onMediaReady: vi.fn() });

        expect(subscribeMock).toHaveBeenCalledWith(EVENTS_URL, expect.anything());
        expect(localStorage.length).toBe(1);
        expect(createEncoderSessionMock.mock.calls[0][0].existingMedia).toEqual({
            hlsUrl: options.hlsUrl,
        });
    });

    it("says so when the API refuses the storage settings", async () => {
        getEncoderConfigMock.mockRejectedValue(
            new Error("Insufficient permissions to edit this document's media"),
        );
        const { edit, error } = useMediaEncoder();
        await edit(options);

        expect(error.value).toContain("permissions");
        expect(createEncoderSessionMock).not.toHaveBeenCalled();
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
            // A resumed session's status says nothing about encryption, so the
            // requirement is kept where a reload can still find it.
            encryptionRequired: true,
        });
    });

    describe("publishing the encoded media", () => {
        /** Starts an encode and hands back the event callback the session subscribed with. */
        const startAndCapture = async (onMediaReady = vi.fn()) => {
            const encoder = useMediaEncoder();
            await encoder.start({
                documentId: "post-1",
                title: "Episode 1",
                mediaBucketId: "bucket-1",
                onMediaReady,
            });
            const handlers = (subscribeMock.mock.calls[0] as any[])[1];
            return { encoder, onMediaReady, emit: handlers.onEvent };
        };

        const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

        it("hands over the URL with the key the collection needs", async () => {
            const { onMediaReady, emit } = await startAndCapture();

            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8" });
            await settle();

            expect(onMediaReady).toHaveBeenCalledWith(
                { hlsUrl: "https://cdn/master.m3u8", hlsKey: "aabbccddeeff00112233445566778899" },
                "post-1",
            );
        });

        it("writes nothing when the key cannot be read, and says so", async () => {
            // Saved without it, the URL is paired with whichever key id the document
            // already carries, and that key does not open this collection.
            fetchEncoderSessionKeyMock.mockRejectedValue(new Error("the encoder answered 500"));
            const { encoder, onMediaReady, emit } = await startAndCapture();

            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8" });
            await settle();

            expect(onMediaReady).not.toHaveBeenCalled();
            expect(encoder.error.value).toContain("500");
        });

        it("clears the key error once a later try reads the key", async () => {
            // The editor is otherwise left reading "not written" about a video that was.
            fetchEncoderSessionKeyMock.mockRejectedValueOnce(new Error("Failed to fetch"));
            const { encoder, onMediaReady, emit } = await startAndCapture();

            emit({ status: "completed", hlsUrl: "https://cdn/master_r1.m3u8" });
            await settle();
            expect(encoder.error.value).toContain("Failed to fetch");

            emit({ status: "completed", hlsUrl: "https://cdn/master_r1.m3u8", progress: 100 });
            await settle();

            expect(onMediaReady).toHaveBeenCalledTimes(1);
            expect(encoder.error.value).toBeUndefined();
        });

        it("tries again on the next event rather than losing the encode", async () => {
            fetchEncoderSessionKeyMock.mockRejectedValueOnce(new Error("connection refused"));
            const { onMediaReady, emit } = await startAndCapture();

            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8" });
            await settle();
            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8", progress: 10 });
            await settle();

            expect(onMediaReady).toHaveBeenCalledTimes(1);
        });

        it("writes nothing when the bucket demands encryption and no key exists", async () => {
            fetchEncoderSessionKeyMock.mockResolvedValue(undefined);
            const { encoder, onMediaReady, emit } = await startAndCapture();

            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8" });
            await settle();

            expect(onMediaReady).not.toHaveBeenCalled();
            expect(encoder.error.value).toContain("requires encrypted media");
        });

        it("publishes without a key when the bucket does not ask for one", async () => {
            getEncoderConfigMock.mockResolvedValue({
                s3: { endPoint: "s3.example.com", bucket: "media" },
                publicBaseUrl: "https://cdn.example.com/media",
                encryption: { required: false },
            });
            fetchEncoderSessionKeyMock.mockResolvedValue(undefined);
            const { onMediaReady, emit } = await startAndCapture();

            emit({ status: "encoding", hlsUrl: "https://cdn/master.m3u8" });
            await settle();

            expect(onMediaReady).toHaveBeenCalledWith(
                { hlsUrl: "https://cdn/master.m3u8", hlsKey: undefined },
                "post-1",
            );
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
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(EVENTS_URL);
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

        expect(onMediaReady).toHaveBeenCalledWith(
            {
                hlsUrl: "https://cdn.example.com/media/s1/master.m3u8",
                hlsKey: "aabbccddeeff00112233445566778899",
            },
            "post-1",
        );
    });

    it("still follows a finished session: an edit in the encoder writes a new version", async () => {
        remember();
        fetchEncoderSessionStatusMock.mockResolvedValue({ sessionId: "s1", status: "completed" });

        expect(
            await useMediaEncoder().resume({ documentId: "post-1", onMediaReady: vi.fn() }),
        ).toBe(true);
        expect(subscribeMock).toHaveBeenCalledWith(EVENTS_URL, expect.anything());
        expect(stored()).not.toBeNull();
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

describe("useMediaEncoder when the editor moves on before an answer arrives", () => {
    const BUCKET_CONFIG = {
        s3: { endPoint: "s3.example.com", bucket: "media" },
        publicBaseUrl: "https://cdn.example.com/media",
        encryption: { required: true },
    };

    /** Holds the bucket config back until the returned function is called with the answer. */
    const holdConfig = () => {
        let answer!: (config: unknown) => void;
        getEncoderConfigMock.mockImplementationOnce(
            () => new Promise((resolve) => (answer = resolve)),
        );
        return (config: unknown) => answer(config);
    };

    const startOn = (encoder: ReturnType<typeof useMediaEncoder>, onMediaReady = vi.fn()) =>
        encoder.start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady,
        });

    /** What the page does on a switch: stop, then resume the document it moved to. */
    const switchTo = async (encoder: ReturnType<typeof useMediaEncoder>, documentId: string) => {
        encoder.stop();
        // The page waits on the encoder's health before it resumes; the new document's
        // Edit is not held back by the old one's call meanwhile.
        expect(encoder.busy.value).toBe(false);
        return encoder.resume({ documentId, onMediaReady: vi.fn() });
    };

    it("keeps an encode answered late out of the document it moved to, and resumes it on return", async () => {
        const answer = holdConfig();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        answer(BUCKET_CONFIG);
        await pending;

        // The encode still opens and is remembered for its own document...
        expect(createEncoderSessionMock).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem("cms_encoderSession_post-1")).not.toBeNull();
        // ...but nothing of it is followed or shown here.
        expect(subscribeMock).not.toHaveBeenCalled();
        expect(encoder.sessionId.value).toBeUndefined();
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
        expect(encoder.busy.value).toBe(false);

        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            documentId: "post-1",
            status: "encoding",
            progress: 5,
        });
        expect(await switchTo(encoder, "post-1")).toBe(true);
        expect(subscribeMock).toHaveBeenCalledWith(EVENTS_URL, expect.anything());
        expect(encoder.status.value).toBe("encoding");
    });

    it("does not show a late failure against the document it moved to", async () => {
        const answer = holdConfig();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        answer(undefined);
        await pending;

        expect(encoder.error.value).toBeUndefined();
        expect(encoder.busy.value).toBe(false);
    });

    it("does not let a resume answered after an Edit follow its older session over the edit's", async () => {
        localStorage.setItem(
            "cms_encoderSession_post-1",
            JSON.stringify({
                sessionId: "s0",
                readToken: "r0",
                eventsUrl: "http://127.0.0.1:31711/api/sessions/s0/events?token=r0",
            }),
        );
        let answerStatus!: (status: unknown) => void;
        fetchEncoderSessionStatusMock.mockImplementationOnce(
            () => new Promise((resolve) => (answerStatus = resolve)),
        );
        const encoder = useMediaEncoder();
        const resumed = encoder.resume({ documentId: "post-1", onMediaReady: vi.fn() });
        await vi.waitFor(() => expect(fetchEncoderSessionStatusMock).toHaveBeenCalled());

        await encoder.edit({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s0/master.m3u8",
            onMediaReady: vi.fn(),
        });
        answerStatus({ sessionId: "s0", documentId: "post-1", status: "completed" });

        expect(await resumed).toBe(false);
        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
    });

    const S0_EVENTS = "http://127.0.0.1:31711/api/sessions/s0/events?token=r0";
    const S1_SESSION = { sessionId: "s1", readToken: "r1", eventsUrl: EVENTS_URL };

    /** Holds the encoder's session answer back until the returned function is called. */
    const holdSession = (session: unknown = S1_SESSION) => {
        let answer!: (session: unknown) => void;
        createEncoderSessionMock.mockImplementationOnce(
            () => new Promise((resolve) => (answer = resolve)),
        );
        return () => answer(session);
    };

    /**
     * Opens the next `count` event streams as a browser does: one closed delivers nothing more.
     * A spec opens exactly that many, so none is left over for the next.
     */
    const closableStreams = (count = 2) => {
        const streams: { url: string; closed: () => boolean; send: (event: object) => void }[] = [];
        const open = (url: string, handlers: { onEvent: (event: object) => void }) => {
            let closed = false;
            streams.push({
                url,
                closed: () => closed,
                send: (event) => {
                    if (!closed) handlers.onEvent(event);
                },
            });
            return () => (closed = true);
        };
        for (let i = 0; i < count; i++) (subscribeMock as any).mockImplementationOnce(open);
        return streams;
    };

    const editOn = (
        encoder: ReturnType<typeof useMediaEncoder>,
        documentId = "post-1",
        onMediaReady = vi.fn(),
    ) =>
        encoder.edit({
            documentId,
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            hlsUrl: `https://cdn.example.com/media/posts/${documentId}/s0/master.m3u8`,
            onMediaReady,
        });

    /** Holds the encoder's status answer back until the returned function is called with it. */
    const holdStatus = () => {
        let answer!: (status: unknown) => void;
        fetchEncoderSessionStatusMock.mockImplementationOnce(
            () => new Promise((resolve) => (answer = resolve)),
        );
        return (status: unknown) => answer(status);
    };

    const storeS0 = (documentId: string) =>
        localStorage.setItem(
            `cms_encoderSession_${documentId}`,
            JSON.stringify({ sessionId: "s0", readToken: "r0", eventsUrl: S0_EVENTS }),
        );

    it("follows an encode answered late once the editor is back on its document", async () => {
        // The encoder takes no edit of a video nobody follows, and nothing else would pick
        // this session up: its handle was stored after the page had resumed the document.
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        expect(await switchTo(encoder, "post-1")).toBe(false);
        answer();
        await pending;

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.busy.value).toBe(false);
        expect(encoder.error.value).toBeUndefined();
    });

    it("catches up and follows an edit answered late once the editor is back on its document", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = encoder.edit({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s0/master.m3u8",
            onMediaReady: vi.fn(),
        });
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");
        answer();
        await pending;

        expect(subscribeMock).toHaveBeenCalledWith(EVENTS_URL, expect.anything());
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.busy.value).toBe(false);
    });

    it("leaves the session already followed on return in place of an encode answered late", async () => {
        storeS0("post-1");
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-1",
            status: "completed",
        });
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        expect(await switchTo(encoder, "post-1")).toBe(true);
        answer();
        await pending;

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect(encoder.sessionId.value).toBe("s0");
    });

    it("leaves the session already followed on return in place of an edit answered late", async () => {
        storeS0("post-1");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-1",
            status: "completed",
        });
        const streams = closableStreams(1);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = editOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        expect(await switchTo(encoder, "post-1")).toBe(true);
        answer();
        await pending;

        expect(streams).toHaveLength(1);
        expect(streams[0].closed()).toBe(false);
        expect(encoder.sessionId.value).toBe("s0");
    });

    it("does not close the stream of the document on screen for an edit answered late for the one it left", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "completed",
        });
        const streams = closableStreams(1);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = editOn(encoder, "post-1");
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        expect(await switchTo(encoder, "post-2")).toBe(true);
        expect(streams[0].url).toBe(S0_EVENTS);
        answer();
        await pending;

        expect(streams[0].closed()).toBe(false);
        streams[0].send({ status: "encoding", progress: 3 });
        expect(encoder.status.value).toBe("encoding");
        expect(encoder.sessionId.value).toBe("s0");
    });

    it("does not report a key read left over from the document it moved away from", async () => {
        let fail!: (err: Error) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((_, reject) => (fail = reject)),
        );
        const onMediaReady = vi.fn();
        const encoder = useMediaEncoder();
        await startOn(encoder, onMediaReady);
        (subscribeMock.mock.calls[0] as any[])[1].onEvent({
            status: "encoding",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s1/master.m3u8",
        });
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        fail(new Error("Failed to fetch"));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(encoder.error.value).toBeUndefined();
        expect(onMediaReady).not.toHaveBeenCalled();
    });

    it("does not let a resume sharing an Encode's call follow its older session over the encode's", async () => {
        // The page's switch resumes once the encoder's health answers; an Encode pressed
        // in between is the newer word on the document.
        storeS0("post-2");
        const answer = holdSession();
        const answerStatus = holdStatus();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.start({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        const resumed = encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() });
        await vi.waitFor(() => expect(fetchEncoderSessionStatusMock).toHaveBeenCalled());

        answer();
        await pending;
        answerStatus({ sessionId: "s0", documentId: "post-2", status: "completed", error: "x" });

        expect(await resumed).toBe(false);
        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
    });

    it("does not let a resume sharing an Encode's call forget the encode's session", async () => {
        storeS0("post-2");
        const answer = holdSession();
        const answerStatus = holdStatus();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.start({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        const resumed = encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() });
        await vi.waitFor(() => expect(fetchEncoderSessionStatusMock).toHaveBeenCalled());

        answer();
        await pending;
        // The encoder no longer holds the older session.
        answerStatus(undefined);

        expect(await resumed).toBe(false);
        expect(JSON.parse(localStorage.getItem("cms_encoderSession_post-2")!).sessionId).toBe("s1");
    });

    it("does not let a resume still handing over its older version follow it over an Encode's", async () => {
        storeS0("post-2");
        const answer = holdSession();
        fetchEncoderSessionStatusMock.mockResolvedValueOnce({
            sessionId: "s0",
            documentId: "post-2",
            status: "completed",
            hlsUrl: "https://cdn.example.com/media/posts/p2/s0/master.m3u8",
        });
        let readKey!: (key: string) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        const resumedOnMediaReady = vi.fn();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.start({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        const resumed = encoder.resume({ documentId: "post-2", onMediaReady: resumedOnMediaReady });
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());

        answer();
        await pending;
        readKey("aabbccddeeff00112233445566778899");

        expect(await resumed).toBe(false);
        expect(resumedOnMediaReady).not.toHaveBeenCalled();
        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
    });

    it("does not let a resume sharing an Encode's call clear the encode's failure", async () => {
        storeS0("post-2");
        createEncoderSessionMock.mockRejectedValueOnce(
            new Error("Luminary Media Convert refused this site."),
        );
        const answerStatus = holdStatus();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.start({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        const resumed = encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() });
        await pending;
        expect(encoder.error.value).toContain("refused");

        answerStatus({ sessionId: "s0", documentId: "post-2", status: "completed" });

        // The document's earlier session is still its own to follow.
        expect(await resumed).toBe(true);
        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(S0_EVENTS);
        expect(encoder.error.value).toContain("refused");
    });

    it("does not let a resume sharing an Edit's call clear the edit's failure", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        createEncoderSessionMock.mockRejectedValueOnce(
            new Error("Luminary Media Convert refused this site."),
        );
        const answerStatus = holdStatus();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.edit({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p2/s0/master.m3u8",
            onMediaReady: vi.fn(),
        });
        const resumed = encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() });
        await pending;
        expect(encoder.error.value).toContain("refused");

        answerStatus({ sessionId: "s0", documentId: "post-2", status: "completed" });

        expect(await resumed).toBe(true);
        expect(encoder.error.value).toContain("refused");
    });

    it("clears the older session's failure a resume sharing an Encode's call wrote, once the encode is followed", async () => {
        storeS0("post-2");
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "failed",
            progress: 40,
            error: "ffmpeg exited with code 1",
        });
        const answer = holdSession();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = encoder.start({
            documentId: "post-2",
            title: "Episode 2",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        // The status read is a loopback request; the create waits on the API and the trust prompt.
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() })).toBe(true);
        expect(encoder.error.value).toBe("ffmpeg exited with code 1");

        answer();
        await pending;

        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.progress.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
    });

    it("clears the older session's failure the return's resume wrote when it follows an encode answered late", async () => {
        storeS0("post-1");
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-1",
            status: "failed",
            error: "ffmpeg exited with code 1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s0/master.m3u8",
        });
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        await switchTo(encoder, "post-2");

        // The return resumes the older session and is still reading its key when the encode answers.
        let readKey!: (key: string) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        const resumed = switchTo(encoder, "post-1");
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());
        expect(encoder.error.value).toBe("ffmpeg exited with code 1");
        answer();
        await pending;
        readKey("aabbccddeeff00112233445566778899");

        expect(await resumed).toBe(false);
        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
    });

    it("keeps the current Encode's failure when it follows an encode answered late", async () => {
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");

        getEncoderConfigMock.mockResolvedValueOnce(undefined);
        await startOn(encoder);
        expect(encoder.error.value).toMatch(/storage configuration/);
        answer();
        await pending;

        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.error.value).toMatch(/storage configuration/);
    });

    it("does not follow an encode answered while the page is still switching documents", async () => {
        // The page waits on the encoder's health between its stop and its resume.
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());

        encoder.stop();
        answer();
        await pending;
        await encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() });

        expect(subscribeMock).not.toHaveBeenCalled();
        expect(encoder.sessionId.value).toBeUndefined();
        expect(encoder.status.value).toBeUndefined();
        expect(localStorage.getItem("cms_encoderSession_post-1")).not.toBeNull();
    });

    it("does not show a late failure once the editor is back on its document", async () => {
        const answer = holdConfig();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");
        answer(undefined);
        await pending;

        expect(encoder.error.value).toBeUndefined();
        expect(encoder.busy.value).toBe(false);
    });

    it("does not show a late refusal once the editor is back on its document", async () => {
        const answer = holdConfig();
        const encoder = useMediaEncoder();
        const pending = startOn(encoder);
        await vi.waitFor(() => expect(getEncoderConfigMock).toHaveBeenCalled());

        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");
        answer({ ...BUCKET_CONFIG, byteRangeBlockSeconds: 60 });
        await pending;

        expect(encoder.needsUpdate.value).toBe(false);
        expect(createEncoderSessionMock).not.toHaveBeenCalled();
    });

    it("does not let an encode answered late replace the newer encode's stored session", async () => {
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const first = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalledTimes(1));
        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");

        // Encode is pressed again on return, and that one answers first.
        const S2_EVENTS = "http://127.0.0.1:31711/api/sessions/s2/events?token=r2";
        createEncoderSessionMock.mockResolvedValueOnce({
            sessionId: "s2",
            readToken: "r2",
            eventsUrl: S2_EVENTS,
        });
        await startOn(encoder);
        answer();
        await first;

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(S2_EVENTS);
        expect(JSON.parse(localStorage.getItem("cms_encoderSession_post-1")!).sessionId).toBe("s2");
    });

    it("clears the older session's failure a resume sharing an Edit's call wrote, once the edit is followed", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "failed",
            progress: 40,
            error: "ffmpeg exited with code 1",
        });
        const answer = holdSession();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = editOn(encoder, "post-2");
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() })).toBe(true);
        expect(encoder.error.value).toBe("ffmpeg exited with code 1");

        answer();
        await pending;

        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.progress.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
    });

    it("clears the older session's failure the return's resume wrote when it follows an edit answered late", async () => {
        storeS0("post-1");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-1",
            status: "failed",
            error: "ffmpeg exited with code 1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s0/master.m3u8",
        });
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = editOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        await switchTo(encoder, "post-2");

        // The return resumes the older session and is still reading its key when the edit answers.
        let readKey!: (key: string) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        const resumed = switchTo(encoder, "post-1");
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());
        expect(encoder.error.value).toBe("ffmpeg exited with code 1");
        answer();
        await pending;
        readKey("aabbccddeeff00112233445566778899");

        expect(await resumed).toBe(false);
        expect((subscribeMock.mock.calls.at(-1) as unknown[])[0]).toBe(EVENTS_URL);
        expect(encoder.status.value).toBeUndefined();
        expect(encoder.error.value).toBeUndefined();
    });

    it("does not let an edit answered late replace the newer edit's stored session", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const first = editOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalledTimes(1));
        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");

        // Edit is pressed again on return, and that one answers first.
        const S2_EVENTS = "http://127.0.0.1:31711/api/sessions/s2/events?token=r2";
        createEncoderSessionMock.mockResolvedValueOnce({
            sessionId: "s2",
            readToken: "r2",
            eventsUrl: S2_EVENTS,
        });
        await editOn(encoder);
        answer();
        await first;

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect((subscribeMock.mock.calls[0] as unknown[])[0]).toBe(S2_EVENTS);
        expect(JSON.parse(localStorage.getItem("cms_encoderSession_post-1")!).sessionId).toBe("s2");
    });

    it("does not take up an encode answered late that a newer one kept from storing, once the newer stream drops", async () => {
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const first = startOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalledTimes(1));
        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");

        const S2_EVENTS = "http://127.0.0.1:31711/api/sessions/s2/events?token=r2";
        createEncoderSessionMock.mockResolvedValueOnce({
            sessionId: "s2",
            readToken: "r2",
            eventsUrl: S2_EVENTS,
        });
        await startOn(encoder);
        // The newer session's stream drops, leaving nothing followed, before the older encode answers.
        (subscribeMock.mock.calls[0] as any[])[1].onError();
        answer();
        await first;

        // The newer session is the one a pick-up finds again.
        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect(encoder.sessionId.value).toBe("s2");
        expect(JSON.parse(localStorage.getItem("cms_encoderSession_post-1")!).sessionId).toBe("s2");
    });

    it("stops the older session a resume sharing an Edit's call follows before the edit reads its key", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "failed",
            error: "ffmpeg exited with code 1",
        });
        const streams = closableStreams();
        const answer = holdSession({
            ...S1_SESSION,
            hlsUrl: "https://cdn.example.com/media/posts/p2/s1/master_r1.m3u8",
        });
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = editOn(encoder, "post-2");
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() })).toBe(true);
        expect(streams[0].url).toBe(S0_EVENTS);

        let readKey!: (key: string | undefined) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        answer();
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());
        expect(encoder.error.value).toBeUndefined();
        // The older session reports its state while the edit reads its key.
        streams[0].send({ status: "failed", error: "ffmpeg exited with code 1" });
        readKey(undefined);
        await pending;

        expect(streams).toHaveLength(2);
        expect(streams[1].url).toBe(EVENTS_URL);
        streams[1].send({ status: "completed" });
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.status.value).toBe("completed");
        expect(encoder.error.value).toBeUndefined();
    });

    it("ignores a message the older session's stream had queued when the edit sharing its call let it go", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "failed",
            error: "ffmpeg exited with code 1",
        });
        const answer = holdSession({
            ...S1_SESSION,
            hlsUrl: "https://cdn.example.com/media/posts/p2/s1/master_r1.m3u8",
        });
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = editOn(encoder, "post-2");
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: vi.fn() })).toBe(true);
        const s0 = (subscribeMock.mock.calls[0] as any[])[1];

        let readKey!: (key: string | undefined) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        answer();
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());
        // Delivered after the stream was closed, as a message already in flight would be.
        s0.onEvent({ status: "failed", error: "ffmpeg exited with code 1" });
        readKey(undefined);
        await pending;

        expect(subscribeMock).toHaveBeenCalledTimes(2);
        const s1 = (subscribeMock.mock.calls[1] as any[])[1];
        s1.onEvent({ status: "completed" });
        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.status.value).toBe("completed");
        expect(encoder.error.value).toBeUndefined();

        // Nor does the older stream's late drop let go of the edit's.
        const unsubscribeS1 = subscribeMock.mock.results[1].value;
        s0.onError();
        expect(unsubscribeS1).not.toHaveBeenCalled();
        s1.onEvent({ status: "completed", progress: 100 });
        expect(encoder.progress.value).toBe(100);
    });

    /**
     * Edit on post-1 held, a switch away and back, then Edit again answered at once as s2.
     * Resolves once s2 is followed; `answer` lets the first edit's session through.
     */
    const editOvertakenOnReturn = async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const first = editOn(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalledTimes(1));
        await switchTo(encoder, "post-2");
        await switchTo(encoder, "post-1");
        createEncoderSessionMock.mockResolvedValueOnce({
            sessionId: "s2",
            readToken: "r2",
            eventsUrl: "http://127.0.0.1:31711/api/sessions/s2/events?token=r2",
        });
        await editOn(encoder);
        expect(subscribeMock).toHaveBeenCalledTimes(1);
        return { encoder, answer, first, s2: (subscribeMock.mock.calls[0] as any[])[1] };
    };

    it("leaves the state the newer edit's session showed when an edit answered late did not store", async () => {
        const { encoder, answer, first, s2 } = await editOvertakenOnReturn();
        s2.onEvent({ status: "completed", error: "write failed" });
        s2.onError();
        answer();
        await first;

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect(encoder.status.value).toBe("completed");
        expect(encoder.error.value).toBe("write failed");
    });

    it("does not take up an edit answered late that a newer one kept from storing, in a browser that refuses storage", async () => {
        // Nothing stored leaves the edit's own catch-up nothing to compare against.
        const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
            throw new DOMException("QuotaExceededError");
        });
        try {
            const { encoder, answer, first, s2 } = await editOvertakenOnReturn();
            s2.onError();
            answer();
            await first;

            expect(subscribeMock).toHaveBeenCalledTimes(1);
            expect(encoder.sessionId.value).toBe("s2");
        } finally {
            setItem.mockRestore();
        }
    });

    /**
     * Stop, then Edit on post-2 held while a resume sharing its call follows s0 on a closable
     * stream. s0 publishes a version whose key read is held; the edit then answers and follows s1.
     */
    const editOvertakesResumeHandOver = async (keyRead: () => Promise<string | undefined>) => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "completed",
        });
        const streams = closableStreams();
        const answer = holdSession();
        const encoder = useMediaEncoder();
        encoder.stop();
        const pending = editOn(encoder, "post-2");
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        const resumeReady = vi.fn();
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: resumeReady })).toBe(
            true,
        );

        fetchEncoderSessionKeyMock.mockImplementationOnce(keyRead);
        streams[0].send({
            status: "completed",
            hlsUrl: "https://cdn.example.com/media/posts/p2/s0/master_r2.m3u8",
        });
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalledTimes(1));
        answer();
        await pending;
        expect(streams[0].closed()).toBe(true);
        expect(streams[1].url).toBe(EVENTS_URL);
        return { encoder, streams, resumeReady };
    };

    it("does not report a key read the replaced session started once the edit sharing its call follows its own", async () => {
        let fail!: (err: Error) => void;
        const { encoder, streams } = await editOvertakesResumeHandOver(
            () => new Promise((_, reject) => (fail = reject)),
        );
        fail(new Error("socket hang up"));
        await new Promise((resolve) => setTimeout(resolve, 0));
        streams[1].send({ status: "completed" });

        expect(encoder.sessionId.value).toBe("s1");
        expect(encoder.error.value).toBeUndefined();
    });

    it("does not hand over a version of the replaced session once the edit sharing its call follows its own", async () => {
        let readKey!: (key: string) => void;
        const { encoder, resumeReady } = await editOvertakesResumeHandOver(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        readKey("aabbccddeeff00112233445566778899");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(encoder.sessionId.value).toBe("s1");
        expect(resumeReady).not.toHaveBeenCalled();
    });

    it("does not hand over a version of the replaced session while the edit sharing its call catches up", async () => {
        storeS0("post-2");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-2",
            status: "completed",
        });
        const streams = closableStreams();
        const s1Url = "https://cdn.example.com/media/posts/p2/s1/master_r1.m3u8";
        const answer = holdSession({ ...S1_SESSION, hlsUrl: s1Url });
        const encoder = useMediaEncoder();
        encoder.stop();
        const editReady = vi.fn();
        const pending = editOn(encoder, "post-2", editReady);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        const resumeReady = vi.fn();
        expect(await encoder.resume({ documentId: "post-2", onMediaReady: resumeReady })).toBe(
            true,
        );

        let readS0Key!: (key: string | undefined) => void;
        let readS1Key!: (key: string | undefined) => void;
        fetchEncoderSessionKeyMock
            .mockImplementationOnce(() => new Promise((resolve) => (readS0Key = resolve)))
            .mockImplementationOnce(() => new Promise((resolve) => (readS1Key = resolve)));
        streams[0].send({
            status: "completed",
            hlsUrl: "https://cdn.example.com/media/posts/p2/s0/master_r2.m3u8",
        });
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalledTimes(1));
        answer();
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalledTimes(2));
        // s0's key read settles while the edit reads its own and nothing is followed.
        readS0Key(undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
        readS1Key(undefined);
        await pending;

        expect(resumeReady).not.toHaveBeenCalled();
        expect(editReady).toHaveBeenCalledWith(
            expect.objectContaining({ hlsUrl: s1Url }),
            "post-2",
        );
        expect(encoder.sessionId.value).toBe("s1");
    });

    it("still hands over a version whose key read outlasts the stream of the session stored for the document", async () => {
        const streams = closableStreams(1);
        const encoder = useMediaEncoder();
        const ready = vi.fn();
        await startOn(encoder, ready);
        let readKey!: (key: string) => void;
        fetchEncoderSessionKeyMock.mockImplementationOnce(
            () => new Promise((resolve) => (readKey = resolve)),
        );
        const s1Url = "https://cdn.example.com/media/posts/post-1/s1/master.m3u8";
        streams[0].send({ status: "encoding", progress: 1, hlsUrl: s1Url });
        await vi.waitFor(() => expect(fetchEncoderSessionKeyMock).toHaveBeenCalled());
        // The stream drops before the key arrives; the session is still the document's.
        (subscribeMock.mock.calls[0] as any[])[1].onError();
        readKey("aabbccddeeff00112233445566778899");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ready).toHaveBeenCalledWith(expect.objectContaining({ hlsUrl: s1Url }), "post-1");
    });

    const S0_R2 = "https://cdn.example.com/media/posts/post-1/s0/master_r2.m3u8";

    /**
     * A start or edit on post-1 held, a switch away and back whose resume follows s0, then the
     * call answers as s1: it stores s1 but leaves s0 followed. Resolves with s0's stream.
     */
    const answeredLateBesideReturn = async (
        call: (encoder: ReturnType<typeof useMediaEncoder>) => Promise<void>,
    ) => {
        storeS0("post-1");
        fetchHlsKeyMock.mockResolvedValue(undefined);
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s0",
            documentId: "post-1",
            status: "completed",
        });
        const streams = closableStreams(1);
        const answer = holdSession();
        const encoder = useMediaEncoder();
        const pending = call(encoder);
        await vi.waitFor(() => expect(createEncoderSessionMock).toHaveBeenCalled());
        await switchTo(encoder, "post-2");
        encoder.stop();
        const ready = vi.fn();
        expect(await encoder.resume({ documentId: "post-1", onMediaReady: ready })).toBe(true);
        answer();
        await pending;

        expect(JSON.parse(localStorage.getItem("cms_encoderSession_post-1")!).sessionId).toBe("s1");
        expect(streams).toHaveLength(1);
        expect(encoder.sessionId.value).toBe("s0");
        return { encoder, stream: streams[0], ready };
    };

    it("still hands over a later version of the session followed on return after an edit answered late stores its own", async () => {
        const { encoder, stream, ready } = await answeredLateBesideReturn((encoder) =>
            editOn(encoder),
        );
        stream.send({ status: "completed", hlsUrl: S0_R2 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ready).toHaveBeenCalledWith(expect.objectContaining({ hlsUrl: S0_R2 }), "post-1");
        expect(encoder.error.value).toBeUndefined();
    });

    it("still hands over a later version of the session followed on return after an encode answered late stores its own", async () => {
        const { stream, ready } = await answeredLateBesideReturn((encoder) => startOn(encoder));
        stream.send({ status: "completed", hlsUrl: S0_R2 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ready).toHaveBeenCalledWith(expect.objectContaining({ hlsUrl: S0_R2 }), "post-1");
    });

    it("still hands over the session it follows once another tab stores another for the document", async () => {
        const streams = closableStreams(1);
        const encoder = useMediaEncoder();
        const ready = vi.fn();
        await startOn(encoder, ready);
        // An Encode pressed on the same document in a second tab writes the shared store.
        storeS0("post-1");
        const s1Url = "https://cdn.example.com/media/posts/post-1/s1/master.m3u8";
        streams[0].send({ status: "encoding", progress: 1, hlsUrl: s1Url });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ready).toHaveBeenCalledWith(expect.objectContaining({ hlsUrl: s1Url }), "post-1");
    });
});

describe("useMediaEncoder in a browser that refuses storage", () => {
    beforeEach(() => {
        vi.spyOn(localStorage, "setItem").mockImplementation(() => {
            throw new DOMException("QuotaExceededError");
        });
    });
    afterEach(() => {
        vi.mocked(localStorage.setItem).mockRestore();
    });

    it("still follows the session an edit opens", async () => {
        fetchHlsKeyMock.mockResolvedValue(undefined);
        const encoder = useMediaEncoder();
        await encoder.edit({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            hlsUrl: "https://cdn.example.com/media/posts/p1/s0/master.m3u8",
            onMediaReady: vi.fn(),
        });

        expect(subscribeMock).toHaveBeenCalledWith(EVENTS_URL, expect.anything());
        expect(encoder.sessionId.value).toBe("s1");
    });
});

describe("useMediaEncoder acknowledging a stored version", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    const R1 = "https://cdn/master_r1.m3u8";
    const R2 = "https://cdn/master_r2.m3u8";

    /** Starts an encode for post-1 and hands back the session's event callback. */
    const startFollowing = async (storedHlsUrl: () => string | undefined) => {
        const encoder = useMediaEncoder({ storedHlsUrl });
        await encoder.start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        const handlers = (subscribeMock.mock.calls.at(-1) as any[])[1];
        return { encoder, emit: handlers.onEvent, drop: handlers.onError };
    };

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("waits until the document holds the version, then tells the encoder once", async () => {
        // Until then the encoder refuses further edits, so no edit builds on a version
        // the document does not name.
        const stored = ref<string>();
        const { emit } = await startFollowing(() => stored.value);

        emit({ status: "completed", hlsUrl: R1 });
        await settle();
        expect(ackEncoderSessionMock).not.toHaveBeenCalled();

        stored.value = R1;
        await nextTick();
        expect(ackEncoderSessionMock).toHaveBeenCalledWith("s1", "r1", R1);

        emit({ status: "completed", hlsUrl: R1, progress: 100 });
        await settle();
        expect(ackEncoderSessionMock).toHaveBeenCalledTimes(1);
    });

    it("tells the encoder about each new version as it is stored", async () => {
        const stored = ref(R1);
        const { emit } = await startFollowing(() => stored.value);
        emit({ status: "completed", hlsUrl: R1 });
        await settle();

        emit({ status: "completed", hlsUrl: R2 });
        await settle();
        expect(ackEncoderSessionMock).toHaveBeenCalledTimes(1);

        stored.value = R2;
        await nextTick();
        expect(ackEncoderSessionMock).toHaveBeenLastCalledWith("s1", "r1", R2);
        expect(ackEncoderSessionMock).toHaveBeenCalledTimes(2);
    });

    it("tries a failed handover again on the next availability check", async () => {
        // After a save the edit session may send nothing more; left to the next event,
        // the version would reach the document only on a reload.
        fetchEncoderSessionKeyMock.mockRejectedValueOnce(new Error("Failed to fetch"));
        const onMediaReady = vi.fn();
        const encoder = useMediaEncoder({ storedHlsUrl: () => undefined });
        await encoder.start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady,
        });
        vi.useFakeTimers();
        (subscribeMock.mock.calls[0] as any[])[1].onEvent({ status: "completed", hlsUrl: R1 });
        await vi.advanceTimersByTimeAsync(0);
        expect(onMediaReady).not.toHaveBeenCalled();

        encoder.watchForEncoder();
        await vi.advanceTimersByTimeAsync(10000);

        expect(onMediaReady).toHaveBeenCalledWith(
            { hlsUrl: R1, hlsKey: "aabbccddeeff00112233445566778899" },
            "post-1",
        );
        expect(encoder.error.value).toBeUndefined();
        encoder.stop();
    });

    it("follows the session again once the encoder answers after its stream dropped", async () => {
        // The encoder takes no edit while nobody follows the session, so a stream lost to
        // a sleeping laptop or a restarted encoder must not stay lost until a reload.
        fetchEncoderSessionStatusMock.mockResolvedValue({
            sessionId: "s1",
            documentId: "post-1",
            status: "completed",
            hlsUrl: R1,
        });
        const { encoder, drop } = await startFollowing(() => R1);
        vi.useFakeTimers();
        drop();
        expect(subscribeMock).toHaveBeenCalledTimes(1);

        encoder.watchForEncoder();
        await vi.advanceTimersByTimeAsync(10000);

        expect(subscribeMock).toHaveBeenCalledTimes(2);
        expect((subscribeMock.mock.calls[1] as unknown[])[0]).toBe(EVENTS_URL);
        encoder.stop();
    });

    it("asks again on the next availability check when the encoder failed to record it", async () => {
        // An edit session can go quiet after a save, leaving no event to retry on.
        ackEncoderSessionMock.mockRejectedValueOnce(new Error("The encoder answered 500"));
        const url = "https://cdn/master_r1.m3u8";
        const encoder = useMediaEncoder({ storedHlsUrl: () => url });
        await encoder.start({
            documentId: "post-1",
            title: "Episode 1",
            mediaBucketId: "bucket-1",
            onMediaReady: vi.fn(),
        });
        vi.useFakeTimers();
        (subscribeMock.mock.calls[0] as any[])[1].onEvent({ status: "completed", hlsUrl: url });
        await vi.advanceTimersByTimeAsync(0);
        expect(ackEncoderSessionMock).toHaveBeenCalledTimes(1);

        encoder.watchForEncoder();
        await vi.advanceTimersByTimeAsync(10000);

        expect(ackEncoderSessionMock).toHaveBeenCalledTimes(2);
        expect(ackEncoderSessionMock).toHaveBeenLastCalledWith("s1", "r1", url);
        encoder.stop();
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

    /**
     * The direction that was missed first time. Quitting the encoder does not
     * hide the tab — switching applications never fires `visibilitychange` — so
     * an editor could be left with a button that looked usable on an app that
     * was gone.
     */
    it("notices the encoder going away, with nobody touching the browser", async () => {
        const { availability, refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        expect(availability.value).toBe("available");
        watchForEncoder();

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        await vi.advanceTimersByTimeAsync(10000);

        expect(availability.value).toBe("unavailable");
    });

    it("comes back on its own when the encoder is reopened", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { availability, refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        watchForEncoder();

        checkEncoderHealthMock.mockResolvedValue({ available: true, apiVersion: "0.0.1" });
        await vi.advanceTimersByTimeAsync(3000);
        expect(availability.value).toBe("available");

        checkEncoderHealthMock.mockResolvedValue({ available: false });
        await vi.advanceTimersByTimeAsync(10000);
        expect(availability.value).toBe("unavailable");
    });

    it("asks sooner while the encoder is missing than once it has answered", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        watchForEncoder();

        const before = checkEncoderHealthMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(9000);
        const whileMissing = checkEncoderHealthMock.mock.calls.length - before;

        expect(whileMissing).toBeGreaterThan(1);
    });

    it("leaves a hidden tab alone — nobody there is waiting for an answer", async () => {
        checkEncoderHealthMock.mockResolvedValue({ available: false });
        const { refreshAvailability, watchForEncoder } = useMediaEncoder();
        await refreshAvailability();
        watchForEncoder();

        const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        const before = checkEncoderHealthMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(12000);

        expect(checkEncoderHealthMock.mock.calls.length).toBe(before);
        hidden.mockRestore();
    });

    /**
     * Switching applications does not fire `visibilitychange`, so the window's
     * own focus event is what catches somebody coming back from the encoder.
     */
    it("asks immediately when the browser window is focused again", async () => {
        const { refreshAvailability } = useMediaEncoder();
        await refreshAvailability();
        const before = checkEncoderHealthMock.mock.calls.length;

        window.dispatchEvent(new Event("focus"));
        await vi.advanceTimersByTimeAsync(0);

        // Greater than, not exactly one more: the listener is removed on unmount,
        // and a composable called outside a component never unmounts, so earlier
        // cases in this file are still listening.
        expect(checkEncoderHealthMock.mock.calls.length).toBeGreaterThan(before);
    });
});
