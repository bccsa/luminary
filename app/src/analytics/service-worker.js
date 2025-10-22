// Define a whitelist of allowed Matomo server hosts (e.g., by hostname only, or full base URLs)
const ALLOWED_MATOMO_SERVERS = [
  "https://matomo.example.com",
  // Add other allowed servers as needed
];

const matomoServerUrlRaw = new URL(location.href).searchParams.get("matomo_server");
let MATOMO_SERVER = null;

try {
  if (matomoServerUrlRaw) {
    // Normalize the provided server URL (strip trailing slashes, enforce HTTPS)
    const url = new URL(matomoServerUrlRaw);
    // Optionally enforce HTTPS only:
    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS Matomo servers are allowed.");
    }
    // Check against allowed servers (by origin)
    if (ALLOWED_MATOMO_SERVERS.includes(url.origin)) {
      MATOMO_SERVER = url.origin;
    } else {
      throw new Error(`Matomo server "${url.origin}" is not whitelisted.`);
    }
  } else {
    throw new Error("matomo_server query parameter is missing.");
  }
} catch (e) {
  // Abort further script execution if invalid
  // Optionally, you can log the error to a monitoring endpoint
  console.error("[ServiceWorker] Invalid matomo_server provided:", e.message);
  // Exit early and do not import scripts or initialize analytics
  // In a service worker, return; essentially halts further execution
  // If this code is at global scope, set a guard
  // For this snippet, we return for the rest of this script scope
  // (No further initialization will run)
  // Optionally, you can self.unregister() here
  // self.unregister && self.unregister();
  throw e; // stops script execution
}

self.importScripts(`${MATOMO_SERVER}/offline-service-worker.js`);
// eslint-disable-next-line no-undef
matomoAnalytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
