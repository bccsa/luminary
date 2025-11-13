/* global matomoAnalytics */
//@ts-ignore
const ALLOWED_MATOMO_SERVERS = (() => {
    try {
        // Prefer whitelist injected by the page before registration (safe for classic/module contexts).
        if (typeof self !== "undefined" && self.__VITE_ALLOWED_MATOMO_SERVERS) {
            return JSON.parse(self.__VITE_ALLOWED_MATOMO_SERVERS);
        }
        // Fallback: process.env if some bundler provides it when building the SW
        if (
            typeof process !== "undefined" &&
            //eslint-disable-next-line no-undef
            process.env &&
            //eslint-disable-next-line no-undef
            process.env.VITE_ALLOWED_MATOMO_SERVERS
        ) {
            //eslint-disable-next-line no-undef
            return JSON.parse(process.env.VITE_ALLOWED_MATOMO_SERVERS);
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to parse VITE_ALLOWED_MATOMO_SERVERS:", err);
    }
    return [];
})();

// In a service worker, self.location is the worker script URL (use it for query params).
const matomoServerUrlRaw = new URL(self.location.href).searchParams.get("matomo_server");

function verifyMatomoServer(serverUrl) {
    if (!Array.isArray(ALLOWED_MATOMO_SERVERS) || ALLOWED_MATOMO_SERVERS.length === 0) {
        throw new Error("VITE_ALLOWED_MATOMO_SERVERS must be a non-empty JSON array of origins.");
    }
    if (!serverUrl) throw new Error("matomo_server query parameter is missing.");
    let url;
    try {
        url = new URL(serverUrl);
    } catch (_) {
        throw new Error("Invalid matomo_server URL.");
    }
    // Ensure only HTTPS servers are allowed
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
    // Ensure matomoAnalytics is defined in the global scope
    const analytics =
        self.matomoAnalytics ||
        (typeof matomoAnalytics !== "undefined" ? matomoAnalytics : undefined);
    // Initialize Matomo Analytics with custom options
    if (analytics && typeof analytics.initialize === "function") {
        analytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
    }
} catch (e) {
    // eslint-disable-next-line no-console
    console.error("Matomo initialization failed:", e);
}
