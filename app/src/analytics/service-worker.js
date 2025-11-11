/* global matomoAnalytics */
// Whitelisted Matomo server origins (must be a JSON array of origins).
// Example: VITE_ALLOWED_MATOMO_SERVERS='["https://analytics.example.com"]'
const ALLOWED_MATOMO_SERVERS = JSON.parse(import.meta.env.VITE_ALLOWED_MATOMO_SERVERS || "[]");

// In a service worker, self.location is the worker script URL (use it for query params).
const matomoServerUrlRaw = new URL(self.location.href).searchParams.get("matomo_server");

function verifyMatomoServer(serverUrl) {
    if (!Array.isArray(ALLOWED_MATOMO_SERVERS) || ALLOWED_MATOMO_SERVERS.length === 0) {
        throw new Error("VITE_ALLOWED_MATOMO_SERVERS must be a non-empty JSON array of origins.");
    }
    if (!serverUrl) throw new Error("matomo_server query parameter is missing.");
    const url = new URL(serverUrl);
    if (url.protocol !== "https:") throw new Error("Only HTTPS Matomo servers are allowed.");
    const origin = url.origin;
    if (!ALLOWED_MATOMO_SERVERS.includes(origin)) {
        throw new Error(`Matomo server "${origin}" is not whitelisted.`);
    }
    return origin;
}

try {
    const MATOMO_SERVER = verifyMatomoServer(matomoServerUrlRaw);
    self.importScripts(`${MATOMO_SERVER}/offline-service-worker.js`);
    // prefer self.matomoAnalytics if provided by imported script
    const analytics =
        self.matomoAnalytics ||
        (typeof matomoAnalytics !== "undefined" ? matomoAnalytics : undefined);
    if (analytics && typeof analytics.initialize === "function") {
        analytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
    }
} catch (e) {
    // eslint-disable-next-line no-console
    console.error("Matomo initialization failed:", e);
}
