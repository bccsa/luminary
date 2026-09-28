import { type App } from "vue";

export let Sentry: typeof import("@sentry/vue") | null = null;

export async function initSentry(app: App) {
    if (!import.meta.env.PROD) return;

    try {
        Sentry = await import("@sentry/vue");
        Sentry.init({
            app,
            dsn: import.meta.env.VITE_SENTRY_DSN,
            integrations: [
                Sentry.captureConsoleIntegration({ levels: ["error"] }),
                Sentry.replayIntegration({ maskAllText: false }),
            ],
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 1.0,
        });
    } catch (e) {
        console.error("Failed to initialize Sentry:", e);
    }
}
