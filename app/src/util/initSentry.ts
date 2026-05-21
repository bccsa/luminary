import { type App } from "vue";

export let Sentry: typeof import("@sentry/vue") | null = null;

export async function initSentry(app: App) {
    if (!import.meta.env.PROD) return;

    try {
        Sentry = await import("@sentry/vue");
        Sentry.init({
            app,
            dsn: import.meta.env.VITE_SENTRY_DSN,
            integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
        });

        // TEMPORARY: confirm Sentry is initialised and ingest is working. Remove once verified.
        Sentry.captureMessage("Sentry initialised", "info");
    } catch (e) {
        console.error("Failed to initialize Sentry:", e);
    }
}
