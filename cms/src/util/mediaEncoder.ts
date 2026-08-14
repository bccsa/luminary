/**
 * Client for the Luminary Media Convert desktop encoder.
 *
 * The encoder is a local application listening on loopback, not a service we host.
 * The browser talks to it directly: nothing is uploaded through the CMS, and the
 * encoder writes to S3 itself with credentials this page forwards to it.
 *
 * Two consequences shape everything below:
 *
 * 1. It may simply not be running, which is an ordinary state rather than an error.
 *    Every entry point starts with a health check, and the fallback is a
 *    `luminary-convert://` link that launches the installed app.
 * 2. Reaching 127.0.0.1 from a public origin is a private-network request. Chrome
 *    sends a Local Network Access preflight and the encoder answers it, then asks
 *    the user to trust this origin the first time. Firefox and Safari do not
 *    implement the grant, so this is Chrome-only at time of writing.
 */

/**
 * Where the encoder listens.
 *
 * 31711 is the port the desktop app binds (DEFAULT_PORT in the encoder's
 * bootstrap.ts) and is the only value that matters in production — the address is
 * fixed by the installed application, not configured by whoever deploys the CMS.
 * VITE_ENCODER_URL exists for running the encoder's API standalone in development,
 * where it defaults to 3000 instead.
 */
export const ENCODER_BASE_URL =
    import.meta.env?.VITE_ENCODER_URL || "http://127.0.0.1:31711";

/** Launch link for an encoder that is installed but not running. */
export const ENCODER_PROTOCOL_URL = "luminary-convert://";

export type EncoderHealth = {
    available: boolean;
    apiVersion?: string;
};

export type EncoderS3Config = {
    endPoint: string;
    port?: number;
    useSSL?: boolean;
    bucket: string;
    region?: string;
    accessKey: string;
    secretKey: string;
    pathPrefix?: string;
};

export type CreateEncoderSessionRequest = {
    /** Idempotency key: a repeat request for the same document reuses the session. */
    documentId: string;
    title: string;
    s3: EncoderS3Config;
    publicBaseUrl: string;
    encryption?: { required: boolean };
    existingMedia?: { hlsUrl: string; hlsKey?: string };
};

export type CreateEncoderSessionResponse = {
    sessionId: string;
    readToken: string;
    eventsUrl: string;
    apiVersion: string;
    reused: boolean;
};

/** The encoder's SSE frame. Only the fields the CMS acts on are named. */
export type EncoderSessionEvent = {
    sessionId: string;
    status: string;
    progress?: number;
    error?: string;
    hlsUrl?: string;
};

/**
 * Is the encoder installed and running? Never throws: "not running" is the
 * expected answer whenever the editor has not installed it.
 */
export async function checkEncoderHealth(
    baseUrl: string = ENCODER_BASE_URL,
): Promise<EncoderHealth> {
    try {
        const res = await fetch(`${baseUrl}/api/cms/health`);
        if (!res.ok) return { available: false };
        const body = (await res.json()) as { status?: string; apiVersion?: string };
        return { available: body.status === "ok", apiVersion: body.apiVersion };
    } catch {
        return { available: false };
    }
}

/**
 * Open (or reuse) an encoder session for a document.
 *
 * Authorised by this page's Origin rather than by a key — there is no credential a
 * browser page could hold that the pages around it could not also read. The first
 * request from a new origin raises a native trust prompt in the encoder, so a
 * rejection here can mean "the user said no" as much as "something is broken".
 */
export async function createEncoderSession(
    request: CreateEncoderSessionRequest,
    baseUrl: string = ENCODER_BASE_URL,
): Promise<CreateEncoderSessionResponse> {
    const res = await fetch(`${baseUrl}/api/cms/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Encoder refused the session (HTTP ${res.status}): ${text}`);
    }
    return JSON.parse(text) as CreateEncoderSessionResponse;
}

/**
 * Subscribe to a session's progress. Returns the unsubscribe function.
 *
 * `eventsUrl` already carries the read token, which is watch-only: it cannot start,
 * cancel, or reach the source file.
 */
export function subscribeToEncoderSession(
    eventsUrl: string,
    handlers: {
        onEvent?: (event: EncoderSessionEvent) => void;
        onError?: () => void;
    },
): () => void {
    const source = new EventSource(eventsUrl);

    source.onmessage = (message) => {
        try {
            handlers.onEvent?.(JSON.parse(message.data) as EncoderSessionEvent);
        } catch {
            /* a frame we cannot parse is not worth tearing the stream down for */
        }
    };
    source.onerror = () => handlers.onError?.();

    return () => source.close();
}

/**
 * Fetch the session's AES-128 key, unmasked.
 *
 * The key is never part of a status or event payload. It is served masked from its
 * own endpoint and unmasked by the holder:
 *
 *     mask = SHA-256(sessionId)[0..15]
 *     key  = masked XOR mask            (XOR is its own inverse)
 *
 * This keeps raw keys out of logs and proxies. It is obscurity, not DRM, and the
 * encoder documents it as such.
 *
 * Returns undefined when the session is unencrypted (404) — which is an answer,
 * not a failure.
 */
export async function fetchEncoderSessionKey(
    sessionId: string,
    readToken: string,
    baseUrl: string = ENCODER_BASE_URL,
): Promise<string | undefined> {
    const res = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/key` +
            `?token=${encodeURIComponent(readToken)}`,
    );
    if (!res.ok) return undefined;

    const body = (await res.json()) as { maskedKeyHex?: string };
    if (!body.maskedKeyHex) return undefined;

    return await unmaskKeyHex(sessionId, body.maskedKeyHex);
}

/** XOR the masked key with SHA-256(sessionId)[0..15]. Self-inverse. */
export async function unmaskKeyHex(sessionId: string, maskedKeyHex: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
    const mask = new Uint8Array(digest).subarray(0, 16);

    const masked = new Uint8Array(maskedKeyHex.length >> 1);
    for (let i = 0; i < masked.length; i++) {
        masked[i] = parseInt(maskedKeyHex.substring(i * 2, i * 2 + 2), 16);
    }

    return Array.from(masked, (byte, i) =>
        (byte ^ mask[i % mask.length]).toString(16).padStart(2, "0"),
    ).join("");
}
