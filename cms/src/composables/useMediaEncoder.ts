import { computed, ref, onUnmounted, watch } from "vue";
import { fetchHlsKey, getRest, type MediaDto } from "luminary-shared";

/**
 * Called for each URL a session publishes, naming the document it is for: once when an
 * encode starts, and again for every version of the video an edit in the encoder writes.
 */
export type MediaReadyHandler = (
    media: Pick<MediaDto, "hlsUrl" | "hlsKey">,
    documentId: string,
) => void;
import {
    ackEncoderSession,
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
    type EncoderPipelineProgress,
    type EncoderSessionEvent,
    type EncoderSessionHandle,
} from "@/util/mediaEncoder";

export type EncoderAvailability =
    "unknown" | "checking" | "available" | "unavailable" | "browser-unsupported";

/** Statuses after which nothing more is encoded. */
const FINISHED_STATUSES = ["completed", "failed"];

const isFinished = (status?: string) => status != undefined && FINISHED_STATUSES.includes(status);

export type UseMediaEncoderOptions = {
    /**
     * The video URL the document holds on the server, absolute. The encoder is told
     * each time it equals the URL the session last published.
     */
    storedHlsUrl?: () => string | undefined;
};

/**
 * Drives one document's encode: check the encoder is there, hand it the bucket, and
 * follow the session for as long as the encoder holds it.
 *
 * The media is saved at the *first* `encoding` event, not at completion. The
 * destination key is settled the moment encoding starts, so the encoder publishes
 * `hlsUrl` then — which lets an editor save and move on while a long encode runs.
 * The URL 404s until the first segments land; the app's coming-soon state covers
 * that window.
 *
 * A finished session is still followed: every edit of the video in the encoder writes
 * a new version under a new URL, and the encoder takes no further edit until the
 * document has stored the last one.
 */
export function useMediaEncoder({ storedHlsUrl }: UseMediaEncoderOptions = {}) {
    const availability = ref<EncoderAvailability>("unknown");
    const encoderVersion = ref<string>();

    /** The encoder answered, but is older than this CMS knows how to talk to. */
    const outdated = computed(
        () => availability.value === "available" && isEncoderOutdated(encoderVersion.value),
    );

    const busy = ref(false);
    const status = ref<string>();
    const progress = ref<number>();
    const pipelineProgress = ref<EncoderPipelineProgress>();
    const error = ref<string>();
    /** An encode of this document is running. An edit session opens finished, so it never counts. */
    const encoding = computed(() => status.value != undefined && !isFinished(status.value));
    const sessionId = ref<string>();

    let unsubscribe: (() => void) | undefined;
    /** The session being followed, and the newest URL it has published. */
    let followed: EncoderSessionHandle | undefined;
    let announced: string | undefined;
    /** The URL the encoder was last told the document holds, on this connection. */
    let acknowledged: string | undefined;
    /** Hands over again a URL whose handover failed, while its session is followed. */
    let retryHandOver: (() => void) | undefined;
    /**
     * Whose session to pick up again when its stream drops. The encoder takes no
     * edit of a video while nobody follows its session, so a stream lost to a
     * sleeping laptop or a restarted encoder cannot be left lost until a reload.
     */
    let lost: { documentId: string; onMediaReady: MediaReadyHandler } | undefined;
    let pickingUp = false;

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
        if (!document.hidden && (await refreshAvailability())) {
            await pickUpLostSession();
            // A handover or acknowledgement that failed is tried again here: an edit
            // session may send no further event to retry it on.
            retryHandOver?.();
            acknowledgeIfStored();
        }
        if (!disposed) schedule();
    }

    /**
     * Follow again a session whose stream dropped, once the encoder answers. Asked on
     * the same beat as availability, for the same reason: nothing tells this page the
     * encoder is back. `resume` settles what is left of it: a session the encoder no
     * longer holds is forgotten, and then there is nothing more to pick up.
     */
    async function pickUpLostSession() {
        const session = lost;
        if (!session || followed || pickingUp || busy.value || disposed) return;
        pickingUp = true;
        try {
            await resume(session);
            if (lost === session && !recallEncoderSession(session.documentId)) lost = undefined;
        } finally {
            pickingUp = false;
        }
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
        void refreshAvailability().then((available) => {
            if (available) void pickUpLostSession();
        });
    };

    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onReturn);
        window.addEventListener("focus", onReturn);
    }

    /** Let go of the stream, keeping whose it was so it can be picked up again. */
    function drop() {
        unsubscribe?.();
        unsubscribe = undefined;
        followed = undefined;
        announced = undefined;
        acknowledged = undefined;
        retryHandOver = undefined;
    }

    /** Stop following for good: the caller has moved on from this document. */
    function stop() {
        drop();
        lost = undefined;
    }

    /**
     * Tell the encoder once the document holds the URL the session last published,
     * however it came to: saved by the caller, saved by the editor, or there already.
     */
    function acknowledgeIfStored() {
        const handle = followed;
        const hlsUrl = announced;
        if (!handle || !hlsUrl || hlsUrl === acknowledged) return;
        if (hlsUrl !== storedHlsUrl?.()) return;

        acknowledged = hlsUrl;
        // Sent as the encoder published it, not in the document's stored shape: the
        // encoder compares the string.
        void ackEncoderSession(handle.sessionId, handle.readToken, hlsUrl).catch(() => {
            // Asked again on the session's next event, or the next availability check.
            if (followed === handle && acknowledged === hlsUrl) acknowledged = undefined;
        });
    }

    if (storedHlsUrl) watch(storedHlsUrl, acknowledgeIfStored);

    function announce(hlsUrl: string) {
        announced = hlsUrl;
        acknowledgeIfStored();
    }

    /**
     * Open an encoder session for this document and follow it.
     *
     * `onMediaReady` fires as soon as the encode has a published URL, and again for
     * each version an edit in the encoder writes. The caller writes it to the
     * document — persistence is the editor's business, not this composable's.
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
        pipelineProgress.value = undefined;
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
                // Carried on the handle so a resumed session, whose status says
                // nothing about encryption, can still tell a missing key from none.
                encryptionRequired: config.encryption?.required,
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

    /**
     * Opens the document's existing video in the encoder, to change its chapters and
     * its audio tracks' languages and names. Nothing is encoded, but each saved edit is
     * a new version of the video under a new URL, so the session is followed like an
     * encode's.
     */
    async function edit(options: {
        documentId: string;
        title: string;
        mediaBucketId: string;
        /** The video's master playlist, absolute. */
        hlsUrl: string;
        onMediaReady: MediaReadyHandler;
    }): Promise<void> {
        error.value = undefined;
        busy.value = true;
        try {
            if (!(await refreshAvailability())) {
                throw new Error("Luminary Media Convert is not running. Start it and try again.");
            }
            // Naming the document has the API check the editor may edit it, and that
            // the bucket is the one its video is in.
            const config = await getRest().getEncoderConfig(
                options.mediaBucketId,
                options.documentId,
            );
            if (!config) {
                throw new Error("Could not read the storage configuration for this bucket.");
            }
            // The encoder reads the video's playlists with it when they are encrypted;
            // none back is a video that never was.
            const hlsKey = await fetchHlsKey(options.documentId, { cms: true });
            const session = await createEncoderSession({
                documentId: options.documentId,
                title: options.title,
                ...config,
                mode: "edit",
                existingMedia: { hlsUrl: options.hlsUrl, ...(hlsKey ? { hlsKey } : {}) },
            });

            const handle: EncoderSessionHandle = {
                sessionId: session.sessionId,
                readToken: session.readToken,
                eventsUrl: session.eventsUrl,
                // Every version of an encrypted video is encrypted with its key; the
                // bucket's current setting says nothing about a video encoded before it.
                encryptionRequired: Boolean(hlsKey),
            };
            rememberEncoderSession(options.documentId, handle);

            if (disposed) return;
            // The session may have opened a newer version than the document holds,
            // when an edit was saved that never reached it.
            await catchUp(handle, options.documentId, session.hlsUrl, options.onMediaReady);
        } catch (err: any) {
            error.value = err?.message ?? String(err);
        } finally {
            busy.value = false;
        }
    }

    /**
     * Hand the caller the playback URL and, when the session has one, its key.
     *
     * Resolves to whether the media was published, so a failed attempt can be made
     * again on the next event rather than leaving the encode with nothing written.
     * Nothing is handed over without the key the collection needs: the document
     * keeps whichever `hlsKey_id` it already had, and that key does not open this
     * collection.
     *
     * `stillWanted` is asked once the key is in: a newer version published meanwhile
     * is handed over instead, and an older one arriving after it must not replace it.
     */
    /** The error a failed key read left, cleared once a later read succeeds. */
    let keyError: string | undefined;

    async function publish(
        handle: EncoderSessionHandle,
        documentId: string,
        hlsUrl: string,
        onMediaReady: MediaReadyHandler,
        stillWanted: () => boolean = () => true,
    ): Promise<boolean> {
        let hlsKey: string | undefined;
        try {
            // Undefined here means the encoder answered 404: the session is
            // unencrypted. Anything else throws.
            hlsKey = await fetchEncoderSessionKey(handle.sessionId, handle.readToken);
        } catch (err: any) {
            if (disposed) return false;
            error.value = keyError = `Could not read the encryption key for this encode: ${
                err?.message ?? String(err)
            } The media was not written to the document.`;
            return false;
        }
        // Read on a later try: the error from the failed one no longer holds.
        if (keyError && error.value === keyError) error.value = undefined;
        keyError = undefined;

        if (disposed || !stillWanted()) return false;

        if (!hlsKey && handle.encryptionRequired) {
            error.value =
                "This bucket requires encrypted media, but the encoder reported no key " +
                "for this encode. The media was not written to the document.";
            return false;
        }

        onMediaReady({ hlsUrl, hlsKey }, documentId);
        return true;
    }

    /**
     * Follow a session's events for as long as the stream stays open, handing over
     * each URL it publishes.
     *
     * `handedOver` covers a URL this page has just handed over for itself, so the
     * first event does not hand the same value over twice.
     */
    function follow(
        handle: EncoderSessionHandle,
        documentId: string,
        onMediaReady: MediaReadyHandler,
        handedOver?: string,
    ): void {
        drop();
        sessionId.value = handle.sessionId;
        followed = handle;
        lost = { documentId, onMediaReady };

        // The URL handed over, or being handed over.
        let claimed = handedOver;

        const handOver = (hlsUrl: string) => {
            if (hlsUrl === claimed) return;
            // Claimed before awaiting so two events in flight cannot both publish, and
            // released again when the attempt did not write anything.
            claimed = hlsUrl;
            retryHandOver = undefined;
            const stillWanted = () => claimed === hlsUrl;
            void publish(handle, documentId, hlsUrl, onMediaReady, stillWanted).then(
                (published) => {
                    if (published || !stillWanted()) return;
                    claimed = undefined;
                    if (followed === handle) retryHandOver = () => handOver(hlsUrl);
                },
            );
        };

        unsubscribe = subscribeToEncoderSession(handle.eventsUrl, {
            onEvent: (event: EncoderSessionEvent) => {
                status.value = event.status;
                progress.value = event.progress;
                pipelineProgress.value = event.pipelineProgress;
                if (event.error) error.value = event.error;

                if (!event.hlsUrl) return;
                announce(event.hlsUrl);
                handOver(event.hlsUrl);
            },
            onError: () => {
                // The stream drops when the encoder quits, the machine sleeps or the
                // session ends. Anything already saved stands, and the session is
                // followed again once the encoder answers, if it still holds it.
                drop();
            },
        });
    }

    /**
     * Hand over the URL a session already has, then follow it. An encoder from before
     * versioned playlists opens its stream with nothing, so a reload would otherwise
     * lose the URL the encoder is already writing to.
     */
    async function catchUp(
        handle: EncoderSessionHandle,
        documentId: string,
        hlsUrl: string | undefined,
        onMediaReady: MediaReadyHandler,
    ): Promise<boolean> {
        const handedOver =
            hlsUrl && (await publish(handle, documentId, hlsUrl, onMediaReady))
                ? hlsUrl
                : undefined;
        if (disposed) return false;

        follow(handle, documentId, onMediaReady, handedOver);
        if (hlsUrl) announce(hlsUrl);
        return true;
    }

    /**
     * Pick up an encode, or an edit, this document already started.
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
        pipelineProgress.value = session.pipelineProgress;
        error.value = session.error;

        return catchUp(handle, options.documentId, session.hlsUrl, options.onMediaReady);
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
        encoding,
        progress,
        pipelineProgress,
        error,
        sessionId,
        refreshAvailability,
        watchForEncoder,
        stopWatching,
        start,
        edit,
        resume,
        stop,
    };
}
