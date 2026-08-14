import { ref, onUnmounted } from "vue";
import { getRest, type MediaDto } from "luminary-shared";
import {
    checkEncoderHealth,
    createEncoderSession,
    fetchEncoderSessionKey,
    subscribeToEncoderSession,
    type EncoderSessionEvent,
} from "@/util/mediaEncoder";

export type EncoderAvailability = "unknown" | "checking" | "available" | "unavailable";

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
        availability.value = health.available ? "available" : "unavailable";
        return health.available;
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
        onMediaReady: (media: Pick<MediaDto, "hlsUrl" | "hlsKey">) => void;
    }): Promise<void> {
        error.value = undefined;
        status.value = undefined;
        progress.value = undefined;
        busy.value = true;

        try {
            if (!(await refreshAvailability())) {
                throw new Error(
                    "Luminary Media Convert is not running. Start it and try again.",
                );
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
                encryption: { required: true },
            });

            sessionId.value = session.sessionId;

            let saved = false;
            stop();
            unsubscribe = subscribeToEncoderSession(session.eventsUrl, {
                onEvent: (event: EncoderSessionEvent) => {
                    status.value = event.status;
                    progress.value = event.progress;
                    if (event.error) error.value = event.error;

                    if (saved || !event.hlsUrl) return;
                    saved = true;

                    void (async () => {
                        // An unencrypted session has no key, which the encoder
                        // answers with a 404 and this reports as undefined.
                        const hlsKey = await fetchEncoderSessionKey(
                            session.sessionId,
                            session.readToken,
                        ).catch(() => undefined);

                        options.onMediaReady({ hlsUrl: event.hlsUrl, hlsKey });
                    })();
                },
                onError: () => {
                    // The stream drops when the encoder quits or the session ends.
                    // Anything already saved stands.
                    stop();
                },
            });
        } catch (err: any) {
            error.value = err?.message ?? String(err);
        } finally {
            busy.value = false;
        }
    }

    onUnmounted(stop);

    return {
        availability,
        encoderVersion,
        busy,
        status,
        progress,
        error,
        sessionId,
        refreshAvailability,
        start,
        stop,
    };
}
