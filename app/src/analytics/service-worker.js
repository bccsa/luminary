const MATOMO_SERVER = new URL(location.href).searchParams.get("matomo_server");

self.importScripts(`${MATOMO_SERVER}/offline-service-worker.js`);
matomoAnalytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
