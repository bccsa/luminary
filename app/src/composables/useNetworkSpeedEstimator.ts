import { computed, ref, watch } from "vue";
import { isDataSaverEnabled, userDataSaverEnabled } from "@/globalConfig";

/**
 * Probe-based connection-speed estimate.
 *
 * Instead of the Network Information API (`navigator.connection.downlink`), which is Chromium-only
 * and silently absent on Safari/Firefox, we time the download of a small same-origin asset. The same
 * code path runs on every browser, so behaviour is consistent everywhere. The estimate is refreshed
 * "when relevant" (startup, regained connectivity, tab focus) rather than continuously.
 *
 * NOTE: a small probe is influenced by latency as much as raw bandwidth, so fast links under-report.
 * That's fine here — the only decision we make is the `< SLOW_CONNECTION_MBPS` threshold, and the
 * Settings page surfaces the live number so the constants below can be tuned against real readings.
 */

/** Same-origin asset of incompressible bytes (no CORS, doesn't gzip). See app/public/. */
const PROBE_URL = "/network-probe.bin";
/** Below this, images downgrade. ~4 Mbps ≈ a slow / congested 4G connection. */
const SLOW_CONNECTION_MBPS = 4;
/** Don't re-probe more often than this (except on a forced refresh). */
const MIN_PROBE_INTERVAL_MS = 60_000;
/** Optimistic default before the first probe / on a first-ever visit (don't degrade everyone). */
const DEFAULT_MBPS = 10;
/** Last measured value is cached here so repeat visitors get correct behaviour on first paint. */
const STORAGE_KEY = "connectionSpeedMbps";

const seeded = Number(localStorage.getItem(STORAGE_KEY));

/**
 * Latest estimated connection speed in Mbps (reactive). Seeded synchronously from the last measured
 * value, falling back to an optimistic default.
 */
export const connectionSpeed = ref<number>(
    Number.isFinite(seeded) && seeded > 0 ? seeded : DEFAULT_MBPS,
);

/** True when the connection is slow enough that we should serve lower-quality images. */
export const isSlowConnection = computed(() => connectionSpeed.value < SLOW_CONNECTION_MBPS);

let lastProbeAt = 0;
let inFlight = false;

/**
 * Measure the connection speed by timing a download of the probe asset and update `connectionSpeed`.
 * Bails out cheaply when measuring would be wasteful (offline, already saving data) or pointless
 * (no `window`/`fetch`, e.g. prerender). Pass `force` to bypass the throttle.
 */
export async function runProbe(force = false): Promise<void> {
    if (typeof window === "undefined" || typeof fetch === "undefined") return; // SSR / prerender
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    // Don't spend data measuring when we're already serving reduced-quality images anyway.
    if (isDataSaverEnabled() || userDataSaverEnabled.value) return;

    const now = performance.now();
    if (!force && (inFlight || now - lastProbeAt < MIN_PROBE_INTERVAL_MS)) return;

    inFlight = true;
    try {
        // Unique query param defeats SW/CDN/browser caching so we always measure the network.
        const url = `${PROBE_URL}?t=${now}-${Math.round(Math.random() * 1e9)}`;
        const start = performance.now();
        const response = await fetch(url, { cache: "no-store" });
        const bytes = (await response.arrayBuffer()).byteLength;
        const seconds = (performance.now() - start) / 1000;

        if (seconds > 0 && bytes > 0) {
            const mbps = (bytes * 8) / seconds / 1e6;
            connectionSpeed.value = mbps;
            localStorage.setItem(STORAGE_KEY, String(mbps));
            lastProbeAt = performance.now();
        }
    } catch {
        // Network hiccup — keep the last/seeded value rather than guessing.
    } finally {
        inFlight = false;
    }
}

// Refresh "when relevant". Mirrors the module-scope listener pattern in globalConfig (`windowWidth`).
if (typeof window !== "undefined") {
    runProbe(true);
    window.addEventListener("online", () => runProbe(true));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") runProbe();
    });
    // When the user turns their Data Saver toggle off, re-measure so quality can recover promptly.
    watch(userDataSaverEnabled, (enabled) => {
        if (!enabled) runProbe(true);
    });
}

export function useNetworkSpeedEstimator() {
    return { connectionSpeed, isSlowConnection, runProbe };
}
