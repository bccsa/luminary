// Define a whitelist of allowed Matomo server hosts (e.g., by hostname only, or full base URLs)
const ALLOWED_MATOMO_SERVERS = import.meta.process.env.VITE_ALLOWED_MATOMO_SERVERS;

const matomoServerUrlRaw = new URL(location.href).searchParams.get("matomo_server");
let MATOMO_SERVER = undefined;

function verifyMatomoServer(serverUrl) {
    if (!matomoServerUrlRaw) throw new Error("matomo_server query parameter is missing.");
    const url = new URL(serverUrl);
    const isSecure = url.protocol === "https:";
    const isWhitelisted = ALLOWED_MATOMO_SERVERS.includes(url.origin);
    if (!isSecure) throw new Error("Only HTTPS Matomo servers are allowed.");
    if (!isWhitelisted) throw new Error(`Matomo server "${url.origin}" is not whitelisted.`);
    return true;
}

if (verifyMatomoServer(matomoServerUrlRaw)) {
    const url = new URL(matomoServerUrlRaw);
    MATOMO_SERVER = url.origin;
}

self.importScripts(`${MATOMO_SERVER}/offline-service-worker.js`);
// eslint-disable-next-line no-undef
matomoAnalytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
