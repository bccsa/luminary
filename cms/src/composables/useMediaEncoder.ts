import { ref, onUnmounted } from "vue";
import { getRest, type MediaDto } from "luminary-shared";
import {
    browserCanReachEncoder,
    checkEncoderHealth,
    createEncoderSession,
    fetchEncoderSessionKey,
    fetchEncoderSessionStatus,
    forgetEncoderSession,
    recallEncoderSession,
    rememberEncoderSession,
    subscribeToEncoderSession,
    type EncoderSessionEvent,
    type EncoderSessionHandle,
} from "@/util/mediaEncoder";

export type EncoderAvailability =
    | "unknown"
    | "checking"
    | "available"
    | "unavailable"
    | "browser-unsupported";

/** Statuses after which no further events arrive. */
const FINISHED_STATUSES = ["completed", "failed"];

const isFinished = (status?: string) => status != undefined && FINISHED_STATUSES.includes(status);

/**
 * Drives one document's encode: check the encoder is there, hand it the bucket, and
 * follow the session until it finishes.
 *
 * The media is saved at the *first* `encoding` event, not at completion. The
 * destination key is settled the moment encoding starts, so the encoder publishes
 * `hlsUrl` then — which lets an editor save and move on while a long encode runs.
 * The URL 404s until the first segments land; the app's coming-soon state covers
 * that window.
 */
export function useMediaEncoder() {
    const availability = ref<EncoderAvailability>("unknown");
    const encoderVersion = ref<string>();

    const busy = ref(false);
    const status = ref<string>();
    const progress = ref<number>();
    const error = ref<string>();
    const sessionId = ref<string>();

    let unsubscribe: (() => void) | undefined;

    /** Is the encoder installed and running? Safe to call repeatedly. */
    async function refreshAvailability(): Promise<boolean> {
        availability.value = "checking";
        const health = await checkEncoderHealth();
        encoderVersion.value = health.apiVersion;

        if (health.available) {
            availability.value = "available";
            stopWatching();
            return true;
        }

        // The browser is only consulted about a failure, never to pre-empt the
        // request: an encoder that answers has proved the point whatever the user
        // agent says.
        availability.value = browserCanReachEncoder() ? "unavailable" : "browser-unsupported";
        return false;
    }

    /**
     * Notice when the encoder appears, without the editor having to try again.
     *
     * Nothing tells this page that a desktop app has started, and the launch
     * link's one re-check was too early — the encoder boots Nest and probes the
     * machine's encoders first, which takes longer than the couple of seconds an
     * app usually needs. It also did nothing at all for someone who opened the
     * app from the Dock rather than the link.
     *
     * Polling stops the moment it answers, and only runs while the tab is
     * visible: a background tab is not a person waiting for a window to appear,
     * and this is a request per interval to a port that may have nothing on it.
     */
    const POLL_MS = 3000;
    let poll: ReturnType<typeof setInterval> | undefined;

    function stopWatching() {
        if (poll) clearInterval(poll);
        poll = undefined;
    }

    async function tick() {
        if (document.hidden) return;
        if (await refreshAvailability()) stopWatching();
        // Gone again: an editor who quits the encoder should not be left with a
        // button that still looks usable.
        else watchForEncoder();
    }

    /** Poll until the encoder answers. Safe to call repeatedly. */
    function watchForEncoder() {
        if (poll || availability.value === "available") return;
        poll = setInterval(() => void tick(), POLL_MS);
    }

    /**
     * Check on returning to the tab, whichever way the answer goes.
     *
     * Polling only runs while the encoder is missing — a request every few
     * seconds for the life of an open document is not worth keeping a button
     * greyed out. But quitting the encoder means leaving the browser and coming
     * back, so this is the one moment that catches it for free.
     */
    const onVisible = () => {
        if (document.hidden) return;
        void tick();
    };

    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

    function stop() {
        unsubscribe?.();
        unsubscribe = undefined;
    }

    /**
     * Open an encoder session for this document and follow it.
     *
     * `onMediaReady` fires once, as soon as the encode has a published URL. The
     * caller writes it to the document — persistence is the editor's business, not
     * this composable's.
     */
    async function start(options: {
        documentId: string;
        title: string;
        mediaBucketId: string;
        onMediaReady: (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => void;
    }): Promise<void> {
        error.value = undefined;
        status.value = undefined;
        progress.value = undefined;
        busy.value = true;

        try {
            if (!(await refreshAvailability())) {
                throw new Error("Luminary Media Convert is not running. Start it and try again.");
            }

            // The credentials are held encrypted server-side and are not replicated
            // to the browser, so they are fetched per encode rather than read off
            // the bucket document this page already has.
            const config = await getRest().getEncoderConfig(options.mediaBucketId);
            if (!config) {
                throw new Error("Could not read the storage configuration for this bucket.");
            }

            const session = await createEncoderSession({
                documentId: options.documentId,
                title: options.title,
                s3: config.s3,
                publicBaseUrl: config.publicBaseUrl,
                // A requirement, not a key policy: the encoder generates and holds
                // the key either way. Encryption was switched off while the app
                // still played HLS with hls.js, which cannot read LMCENC playlists;
                // it now plays through `player-web-legacy`, which decrypts them and
                // fetches the key from the sidecar endpoint (ADR 0019).
                encryption: { required: true },
            });

            const handle: EncoderSessionHandle = {
                sessionId: session.sessionId,
                readToken: session.readToken,
                eventsUrl: session.eventsUrl,
            };
            // Stored before the first event, so a reload during the encode can
            // find it again.
            rememberEncoderSession(options.documentId, handle);

            follow(handle, options.documentId, options.onMediaReady);
        } catch (err: any) {
            error.value = err?.message ?? String(err);
        } finally {
            busy.value = false;
        }
    }

    /** Hand the caller the playback URL and, when the session has one, its key. */
    async function publish(
        handle: EncoderSessionHandle,
        hlsUrl: string,
        onMediaReady: (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => void,
    ): Promise<void> {
        // An unencrypted session has no key, which the encoder answers with a 404
        // and this reports as undefined.
        const hlsKey = await fetchEncoderSessionKey(handle.sessionId, handle.readToken).catch(
            () => undefined,
        );

        onMediaReady({ hlsUrl, hlsKey });
    }

    /**
     * Follow a session's events until it ends.
     *
     * `alreadyPublished` covers a session whose URL this page has just read for
     * itself, so resuming does not hand the same value over twice.
     */
    function follow(
        handle: EncoderSessionHandle,
        documentId: string,
        onMediaReady: (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => void,
        alreadyPublished = false,
    ): void {
        sessionId.value = handle.sessionId;

        let saved = alreadyPublished;
        stop();
        unsubscribe = subscribeToEncoderSession(handle.eventsUrl, {
            onEvent: (event: EncoderSessionEvent) => {
                status.value = event.status;
                progress.value = event.progress;
                if (event.error) error.value = event.error;

                // Nothing follows a finished session, so the handle stops being
                // worth offering to the next page load.
                if (isFinished(event.status)) forgetEncoderSession(documentId);

                if (saved || !event.hlsUrl) return;
                saved = true;

                void publish(handle, event.hlsUrl, onMediaReady);
            },
            onError: () => {
                // The stream drops when the encoder quits or the session ends.
                // Anything already saved stands.
                stop();
            },
        });
    }

    /**
     * Pick up an encode this document already started.
     *
     * An encode outlives the page: it runs for minutes in a separate application,
     * and until this ran, a reload left the editor with a document being written to
     * by something they could no longer see.
     *
     * Resolves to whether a session was found. The stored handle is dropped only
     * when the encoder answers that it no longer holds it — an encoder that is
     * merely closed must not cost the editor a session still running behind it.
     */
    async function resume(options: {
        documentId: string;
        onMediaReady: (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => void;
    }): Promise<boolean> {
        const handle = recallEncoderSession(options.documentId);
        if (!handle) return false;
        if (!(await refreshAvailability())) return false;

        const session = await fetchEncoderSessionStatus(handle.sessionId, handle.readToken);
        if (!session) {
            forgetEncoderSession(options.documentId);
            return false;
        }

        // A handle naming another document is not this page's to follow.
        if (session.documentId && session.documentId != options.documentId) {
            forgetEncoderSession(options.documentId);
            return false;
        }

        sessionId.value = session.sessionId;
        status.value = session.status;
        progress.value = session.progress;
        error.value = session.error;

        // Written again on resume because a reload before the first event would
        // otherwise lose the URL the encoder is already writing to.
        if (session.hlsUrl) await publish(handle, session.hlsUrl, options.onMediaReady);

        if (isFinished(session.status)) {
            forgetEncoderSession(options.documentId);
            return true;
        }

        follow(handle, options.documentId, options.onMediaReady, Boolean(session.hlsUrl));
        return true;
    }

    onUnmounted(() => {
        stop();
        stopWatching();
        if (typeof document !== "undefined")
            document.removeEventListener("visibilitychange", onVisible);
    });

    return {
        availability,
        encoderVersion,
        busy,
        status,
        progress,
        error,
        sessionId,
        refreshAvailability,
        watchForEncoder,
        stopWatching,
        start,
        resume,
        stop,
    };
}
