import { type App, watchEffect } from "vue";
import type { Event, EventHint } from "@sentry/vue";
import { isConnected, type DiagnosticsReporter } from "luminary-shared";
import { isAuthenticated } from "@/auth";
import { appLanguageAsRef, isInstalledStandalone } from "@/globalConfig";

export let Sentry: typeof import("@sentry/vue") | null = null;

/**
 * IndexedDB failures caused by the browser (lost connections, eviction, quota) rather than our
 * code. WebKit in particular raises these after a backgrounded tab resumes.
 */
const BROWSER_STORAGE_ERROR =
    /indexeddb|indexed database|database connection|transaction|cursor|object ?store|quota ?exceeded/i;

/** Forwards the shared lib's handled failures and flow steps to Sentry, tagged by area/op. */
export const sentryDiagnostics: DiagnosticsReporter = {
    captureError: (err, { area, op, data }) => {
        Sentry?.captureException(err, {
            tags: { area, op },
            contexts: data ? { diagnostics: data } : undefined,
        });
    },
    breadcrumb: (message, { area, op, data }) => {
        Sentry?.addBreadcrumb({ category: `${area}.${op}`, message, data, level: "info" });
    },
};

/** Groups browser-caused storage failures together so they don't bury real bugs. */
export function classifyEvent(event: Event, hint: EventHint): Event {
    const exception = event.exception?.values?.[0];
    const original = hint.originalException;
    const text = [
        exception?.type,
        exception?.value,
        original instanceof Error ? `${original.name} ${original.message}` : "",
    ].join(" ");

    if (BROWSER_STORAGE_ERROR.test(text)) {
        event.tags = { ...event.tags, cause: "browser-storage" };
        event.fingerprint = ["browser-storage", exception?.type ?? "unknown"];
    }
    return event;
}

export async function initSentry(app: App) {
    if (!import.meta.env.PROD) return;

    try {
        Sentry = await import("@sentry/vue");
        Sentry.init({
            app,
            dsn: import.meta.env.VITE_SENTRY_DSN,
            release: __APP_BUILD_ID__,
            environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || undefined,
            integrations: [Sentry.replayIntegration({ maskAllText: false })],
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 1.0,
            beforeSend: classifyEvent,
        });

        const sentry = Sentry;
        const installMode = isInstalledStandalone() ? "standalone" : "browser";
        watchEffect(() => {
            sentry.setTags({
                connected: isConnected.value,
                authenticated: isAuthenticated.value,
                language: appLanguageAsRef.value?.languageCode ?? "unknown",
                installMode,
            });
        });
    } catch (e) {
        console.error("Failed to initialize Sentry:", e);
    }
}
