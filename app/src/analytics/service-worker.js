const MATOMO_SERVER = new URL(location.href).searchParams.get("matomo_server");

self.importScripts(`${MATOMO_SERVER}/offline-service-worker.js`);
// eslint-disable-next-line no-undef
matomoAnalytics.initialize({ queueLimit: 10000, timeLimit: 86400 * 30 });
