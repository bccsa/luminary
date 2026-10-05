import { fetchEventSource } from "@microsoft/fetch-event-source";
import { ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { AccessMap, accessMap } from "../permissions/permissions";
import { config, SharedConfig } from "../config";
import { reportBreadcrumb } from "../diagnostics";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    maxUploadFileSize: number;
    accessMap: AccessMap;
};

/**
 * Connection status as a Vue ref
 */
export const isConnected = ref(false);

/**
 * Maximum file size for uploads in bytes as a Vue ref
 */
export const maxUploadFileSize = useLocalStorage("maxUploadFileSize", 0);

/** Same backoff ceiling the Socket.io client used, so offline recovery latency is unchanged. */
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 5000;

/** Server heartbeat is 25s; two missed beats means the connection is dead without having closed. */
const IDLE_TIMEOUT_MS = 60_000;

/** Thrown from the stream callbacks to stop fetch-event-source's own retry loop. */
class FatalStreamError extends Error {}

type AuthConnectError = Error & { data?: { type?: string; reason?: string } };

/**
 * Live update transport: one Server-Sent Events stream (`GET /live`). Keeps the former Socket.io
 * client's surface (`on`/`off`, `connectError`, `data`) so consumers are transport-agnostic.
 */
class ChangeFeed {
    private listeners = new Map<string, Set<(...args: any[]) => void>>();
    private abortController: AbortController | undefined;
    private auth: { token?: string; providerId?: string | null } = {};
    private retryDelay = RETRY_MIN_MS;
    private idleTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Create a new ChangeFeed instance
     * @param {SharedConfig} config - Configuration object
     */
    constructor(private readonly config: SharedConfig) {
        // A tab foregrounded after an auth failure has no stream running. Retry once when it becomes
        // visible; consumer auth-error handlers remain responsible for refreshing credentials if
        // the retry is rejected.
        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") this.connect();
            });
        }
    }

    /** One throwing listener must not tear down the stream or starve the other listeners. */
    private dispatch(event: string, payload: unknown) {
        this.listeners.get(event)?.forEach((cb) => {
            try {
                cb(payload);
            } catch (e) {
                reportBreadcrumb(`Change feed listener failed: ${(e as Error)?.message}`, {
                    area: "live",
                    op: "listener-error",
                });
            }
        });
    }

    private open() {
        const controller = new AbortController();
        this.abortController = controller;
        const headers: Record<string, string> = {};
        if (this.auth.token) headers.Authorization = `Bearer ${this.auth.token}`;
        if (this.auth.providerId) headers["x-auth-provider-id"] = this.auth.providerId;

        // The CMS flag routes the stream to CmsView-scoped delivery (drafts/expired, full); the app
        // gets published-only content with expired content stripped.
        const url = `${this.config.apiUrl}/live?cms=${this.config.cms === true ? 1 : 0}`;

        fetchEventSource(url, {
            headers,
            signal: controller.signal,
            // Keep the stream open in background tabs (the library pauses it by default).
            openWhenHidden: true,
            fetch: (...args) => fetch(...args),
            onopen: async (res) => {
                if (res.ok) return this.armIdleTimer();
                if (res.status === 401) await this.rejectAuth(res);
                throw new Error(`Change feed rejected: HTTP ${res.status}`);
            },
            onmessage: (ev) => {
                this.armIdleTimer();
                if (ev.event !== "clientConfig" && ev.event !== "data") return;
                let payload;
                try {
                    payload = JSON.parse(ev.data);
                } catch {
                    // A malformed frame is dropped; throwing would reconnect and replay the same stream
                    reportBreadcrumb("Change feed received malformed JSON", {
                        area: "live",
                        op: "parse-error",
                    });
                    return;
                }
                if (ev.event === "clientConfig") this.applyConfig(payload);
                else this.dispatch("data", payload);
            },
            // A stream that ends cleanly is still a lost connection; throwing makes the library retry.
            onclose: () => {
                throw new Error("Change feed closed");
            },
            onerror: (err) => {
                if (err instanceof FatalStreamError) throw err;
                reportBreadcrumb(`Change feed error: ${err?.message}`, {
                    area: "live",
                    op: "connect-error",
                });
                isConnected.value = false;
                clearTimeout(this.idleTimer);
                const delay = this.retryDelay;
                this.retryDelay = Math.min(delay * 2, RETRY_MAX_MS);
                return delay;
            },
        }).catch(() => {
            // Only reached for FatalStreamError; the connectError event has already been dispatched.
            if (this.abortController === controller) this.abortController = undefined;
        });
    }

    /** Reopen the stream if nothing (not even a heartbeat) arrives for too long. */
    private armIdleTimer() {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.reconnect(), IDLE_TIMEOUT_MS);
    }

    /** Surface an auth rejection as the `connectError` shape the consumers' auth handlers expect. */
    private async rejectAuth(res: Response): Promise<never> {
        const body = (await res.json().catch(() => ({}))) as { type?: string; reason?: string };
        const err: AuthConnectError = new Error("auth_failed");
        err.data = { type: "auth_failed", ...(body.reason ? { reason: body.reason } : {}) };
        reportBreadcrumb(`Change feed auth failed: ${body.reason}`, {
            area: "live",
            op: "connect-error",
            data: { type: err.data.type },
        });
        isConnected.value = false;
        clearTimeout(this.idleTimer);
        // Stop retrying: the same stale credentials would be rejected again
        this.dispatch("connectError", err);
        throw new FatalStreamError("auth_failed");
    }

    private applyConfig(c: ClientConfig) {
        if (c.maxUploadFileSize) maxUploadFileSize.value = c.maxUploadFileSize;
        if (c.accessMap) accessMap.value = c.accessMap;
        reportBreadcrumb("Change feed connected and configured", { area: "live", op: "connect" });
        this.retryDelay = RETRY_MIN_MS;
        isConnected.value = true; // Only set isConnected after configuration has been received from the API
    }

    /**
     * Adds the listener function as an event listener for ev.
     * @param event — Name of the event
     * @param callback — Callback function
     */
    public on(event: string, callback: (...args: any[]) => void) {
        let set = this.listeners.get(event);
        if (!set) this.listeners.set(event, (set = new Set()));
        set.add(callback);
    }

    /**
     * Removes the listener function as an event listener for ev.
     * @param event - Name of the event
     * @param callback - Callback function
     */
    public off(event: string, callback: (...args: any[]) => void) {
        this.listeners.get(event)?.delete(callback);
    }

    /**
     * Close the change feed
     */
    public disconnect() {
        clearTimeout(this.idleTimer);
        this.abortController?.abort();
        this.abortController = undefined;
        isConnected.value = false;
    }

    /**
     * Update the credentials sent with the change feed request.
     * @param token - JWT access token
     * @param providerId - Active auth provider id (or null/undefined for guest)
     */
    public setAuth(token: string, providerId?: string | null) {
        this.auth = { token, providerId };
    }

    /**
     * Open the change feed (no-op if already open)
     */
    public connect() {
        if (this.abortController) return;
        this.retryDelay = RETRY_MIN_MS;
        this.open();
    }

    /**
     * Close and reopen the change feed, e.g. after the credentials changed.
     */
    public reconnect() {
        this.disconnect();
        this.connect();
    }
}

let socket: ChangeFeed;

/**
 * Whether {@link getChangeFeed} can return a socket instead of throwing. Callers that attach live
 * listeners opportunistically (rather than as part of an initialized app) use this so an
 * environment with no socket configured — a server-side render, a bare test harness — is a
 * no-op rather than an error.
 */
export function isChangeFeedConfigured(): boolean {
    return !!socket || !!config?.apiUrl;
}

/**
 * Returns a singleton instance of the ChangeFeed client class.
 * @param options - Socket connection options
 */
export function getChangeFeed(
    options: {
        /**
         * Force a reconnect to the server if the socket already exists
         */
        reconnect: boolean;
    } = { reconnect: false },
) {
    if (!socket) {
        if (!config) {
            throw new Error("Shared config object not initialized");
        }
        if (!config.apiUrl) {
            throw new Error("Socket connection requires an API URL");
        }

        socket = new ChangeFeed(config);
    } else if (options.reconnect) socket.reconnect();

    return socket;
}
