import { computed, ref, onUnmounted } from "vue";
import { getRest, type MediaDto } from "luminary-shared";

/** Called once per encode, as soon as it has a published URL, naming the document it is for. */
export type MediaReadyHandler = (
    media: Pick<MediaDto, "hlsUrl" | "hlsKey">,
    documentId: string,
) => void;
import {
    browserCanReachEncoder,
    checkEncoderHealth,
    createEncoderSession,
    fetchEncoderSessionKey,
    fetchEncoderSessionStatus,
    forgetEncoderSession,
    recallEncoderSession,
    rememberEncoderSession,
    isEncoderOutdated,
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

    /** The encoder answered, but is older than this CMS knows how to talk to. */
    const outdated = computed(
        () => availability.value === "available" && isEncoderOutdated(encoderVersion.value),
    );

    const busy = ref(false);
    const status = ref<string>();
    const progress = ref<number>();
    const error = ref<string>();
    const sessionId = ref<string>();

    let unsubscribe: (() => void) | undefined;

    // The awaits in start/resume/publish can outlive the component (the encoder's
    // trust prompt, a slow key fetch); nothing after them may touch a dead instance.
    let disposed = false;

    /** Is the encoder installed and running? Safe to call repeatedly. */
    async function refreshAvailability(): Promise<boolean> {
        // Only the first check shows as "checking": every later one is a re-check on
        // a poll tick or window focus, and flipping the state then disables the Encode
        // button under the editor's cursor.
        if (availability.value === "unknown") availability.value = "checking";
        const health = await checkEncoderHealth();
        encoderVersion.value = health.apiVersion;

        if (health.available) {
            availability.value = "available";
            return true;
        }

        // The browser is only consulted about a failure, never to pre-empt the
        // request: an encoder that answers has proved the point whatever the user
        // agent says.
        availability.value = browserCanReachEncoder() ? "unavailable" : "browser-unsupported";
        return false;
    }

    /**
     * Keep the encoder's availability true, in both directions.
     *
     * Nothing tells this page that a desktop app has started or stopped, so it
     * is asked. Polling runs the whole time the section is mounted rather than
     * only while the encoder is missing: an editor who quits it should not be
     * left with a button that still looks usable, and a stale "not running"
     * notice is no better.
     *
     * Slower once it has answered, because then it is confirming rather than
     * waiting. Both are a loopback request that fails immediately when nothing
     * is listening on the port.
     */
    const POLL_MISSING_MS = 3000;
    const POLL_PRESENT_MS = 10000;
    let poll: ReturnType<typeof setTimeout> | undefined;

    function stopWatching() {
        if (poll) clearTimeout(poll);
        poll = undefined;
    }

    async function tick() {
        // A hidden tab is nobody waiting for an answer; the next focus asks.
        if (!document.hidden) await refreshAvailability();
        if (!disposed) schedule();
    }

    function schedule() {
        stopWatching();
        const wait = availability.value === "available" ? POLL_PRESENT_MS : POLL_MISSING_MS;
        poll = setTimeout(() => void tick(), wait);
    }

    /** Start watching. Safe to call repeatedly. */
    function watchForEncoder() {
        if (poll) return;
        schedule();
    }

    /**
     * Ask immediately when the window comes back.
     *
     * `visibilitychange` covers tab switches and minimising, but not switching
     * to another application — which is how somebody quits the encoder, so it
     * would miss exactly the case it is most needed for. `focus` on the window
     * catches that.
     */
    const onReturn = () => {
        if (document.hidden) return;
        void refreshAvailability();
    };

    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onReturn);
        window.addEventListener("focus", onReturn);
    }

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
        onMediaReady: MediaReadyHandler;
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

            // The response is shaped as the encoder's session body — the bucket's
            // encode settings (encryption, byte range, chunk size) travel inside it,
            // so this page forwards them without knowing what they are.
            const session = await createEncoderSession({
                documentId: options.documentId,
                title: options.title,
                ...config,
            });

            const handle: EncoderSessionHandle = {
                sessionId: session.sessionId,
                readToken: session.readToken,
                eventsUrl: session.eventsUrl,
            };
            // Stored before the first event, so a reload during the encode can
            // find it again — and so a page that has since moved on can resume it.
            rememberEncoderSession(options.documentId, handle);

            if (disposed) return;
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
        documentId: string,
        hlsUrl: string,
        onMediaReady: MediaReadyHandler,
    ): Promise<void> {
        // An unencrypted session has no key, which the encoder answers with a 404
        // and this reports as undefined.
        const hlsKey = await fetchEncoderSessionKey(handle.sessionId, handle.readToken).catch(
            () => undefined,
        );

        if (disposed) return;
        onMediaReady({ hlsUrl, hlsKey }, documentId);
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
        onMediaReady: MediaReadyHandler,
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

                void publish(handle, documentId, event.hlsUrl, onMediaReady);
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
        onMediaReady: MediaReadyHandler;
    }): Promise<boolean> {
        const handle = recallEncoderSession(options.documentId);
        if (!handle) return false;
        if (!(await refreshAvailability()) || disposed) return false;

        const session = await fetchEncoderSessionStatus(handle.sessionId, handle.readToken);
        if (disposed) return false;
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
        if (session.hlsUrl) {
            await publish(handle, options.documentId, session.hlsUrl, options.onMediaReady);
            if (disposed) return false;
        }

        if (isFinished(session.status)) {
            forgetEncoderSession(options.documentId);
            return true;
        }

        follow(handle, options.documentId, options.onMediaReady, Boolean(session.hlsUrl));
        return true;
    }

    onUnmounted(() => {
        disposed = true;
        stop();
        stopWatching();
        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", onReturn);
            window.removeEventListener("focus", onReturn);
        }
    });

    return {
        availability,
        encoderVersion,
        outdated,
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
