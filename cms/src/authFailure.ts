import { getSocket } from "luminary-shared";
import {
    clearAuthCache,
    loginWithProvider,
    openProviderModal,
    refreshTokenWithOutcome,
    resolveActiveProvider,
} from "@/auth";
import * as Sentry from "@sentry/vue";

type AuthConnectError = Error & { data?: { type?: string; reason?: string } };

/**
 * Backoff for retrying a refresh the provider could not answer. Short at first
 * so a brief blip recovers unnoticed, then long enough that a sustained outage
 * costs one request a minute rather than a login screen.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000];

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;
let onlineListenerAttached = false;

function cancelPendingRetry(): void {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
}

function resetRetries(): void {
    cancelPendingRetry();
    retryAttempt = 0;
}

function openAnonymousConnection(): void {
    getSocket().connect();
}

/**
 * Coming back online is better evidence than any remaining timer, so retry at
 * once rather than waiting it out. Attached lazily: a session that never fails
 * never needs it.
 */
function attachOnlineRetry(): void {
    if (onlineListenerAttached || typeof window === "undefined") return;
    onlineListenerAttached = true;
    window.addEventListener("online", () => {
        if (retryAttempt === 0) return;
        cancelPendingRetry();
        void attemptRecovery();
    });
}

function scheduleRetry(): void {
    if (retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void attemptRecovery();
    }, delay);
    attachOnlineRetry();
}

/** Drop the session and send the user through a visible login. */
async function forceReLogin(): Promise<void> {
    Sentry.captureMessage("API authentication failed; the provider refused the refresh");
    const lastProvider = await resolveActiveProvider();
    clearAuthCache();
    if (lastProvider) {
        await loginWithProvider(lastProvider, { prompt: "login" });
    } else {
        openProviderModal();
        // Auto-reconnection is off after an auth failure, so without this the
        // modal has nothing to list.
        openAnonymousConnection();
    }
}

/**
 * Ask for a fresh token and act on why it did not arrive. Only an outright
 * refusal costs the user their session — anything that merely failed to reach
 * the provider is retried with the credentials left in place.
 */
async function attemptRecovery(): Promise<void> {
    const outcome = await refreshTokenWithOutcome({ ignoreCache: true, requireJwt: true });

    if (outcome === "refreshed" || outcome === "superseded") {
        resetRetries();
        return;
    }

    if (outcome === "unavailable") {
        scheduleRetry();
        return;
    }

    resetRetries();
    await forceReLogin();
}

/**
 * Recover from a socket handshake the API rejected on auth grounds.
 */
export async function handleConnectError(err: AuthConnectError): Promise<void> {
    if (err.data?.type !== "auth_failed" && err.message !== "auth_failed") return;

    // Provider was deleted / never existed: don't re-attempt login with the
    // cached provider (it'll loop). Force the user through provider selection.
    if (err.data?.reason === "provider_not_found") {
        resetRetries();
        clearAuthCache();
        openProviderModal();
        // The socket stops auto-reconnecting after an auth failure, so without an
        // explicit anonymous connect nothing syncs the AuthProvider docs that the
        // modal just opened to display.
        openAnonymousConnection();
        return;
    }

    await attemptRecovery();
}

/**
 * Attach the handler. Must run before setupAuth(), which may connect with an
 * already-expired token: a listener attached after that misses the failure event
 * and the client loops.
 */
export function registerAuthFailureHandler(): void {
    resetRetries();
    getSocket().on("connect_error", handleConnectError);
}
