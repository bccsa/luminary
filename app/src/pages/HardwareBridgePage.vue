<script setup lang="ts">
import { onMounted, ref } from "vue";
import { markPageReady } from "@/util/renderState";

// PoC page: an HTTPS-hosted Luminary instance calling a visitor's local
// Hardware Bridge at http://localhost:4781. Surfaces the three obstacles
// (mixed content, CORS, Local Network Access) so it doubles as a diagnostic.
// Copy is hardcoded English on purpose — this is a throwaway PoC page and
// must not add entries to the CouchDB Language docs / i18n workflow.

const bridgeUrl = ref("http://localhost:4781");
const lnaState = ref<"granted" | "denied" | "prompt" | "unsupported" | "checking">(
    "checking",
);
const lnaNote = ref("");
const output = ref("—");
const pageOrigin = typeof window !== "undefined" ? window.location.origin : "";

const browser = (() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Edg\//.test(ua)) return "Edge (Chromium)";
    if (/OPR\//.test(ua)) return "Opera (Chromium)";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua) && !/Edg|OPR/.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Other (Chromium-based)";
})();

const isLoopback = (host: string) => /localhost|127\.0\.0\.1|\.localhost$/.test(host);

async function refreshLna() {
    if (!navigator.permissions || !navigator.permissions.query) {
        lnaState.value = "unsupported";
        lnaNote.value = "navigator.permissions.query unavailable";
        return;
    }
    try {
        // 'local-network-access' is unknown to Firefox/Safari → throws.
        const status = await navigator.permissions.query({
            name: "local-network-access" as PermissionName,
        });
        lnaState.value = status.state as "granted" | "denied" | "prompt";
        lnaNote.value =
            status.state === "prompt"
                ? "first call will trigger a browser permission prompt"
                : "";
        status.onchange = () => {
            lnaState.value = status.state as "granted" | "denied" | "prompt";
        };
    } catch {
        lnaState.value = "unsupported";
        lnaNote.value =
            "browser doesn't know the 'local-network-access' permission (Firefox/Safari)";
    }
}

// Fetch helper that turns an ambiguous TypeError: Failed to fetch into a
// best-effort explanation of *which* of the three obstacles bit us.
async function call(path: string, init?: RequestInit) {
    const url = bridgeUrl.value.replace(/\/$/, "") + path;
    try {
        const res = await fetch(url, init);
        let data: unknown = null;
        try {
            data = await res.json();
        } catch {
            /* non-JSON body is fine */
        }
        return { ok: res.ok, status: res.status, data, url };
    } catch (e) {
        const err = e as Error;
        let why = "Network error.";
        try {
            const u = new URL(url);
            const loopbackTarget = isLoopback(u.hostname);
            if (!loopbackTarget && u.protocol === "http:") {
                why =
                    "Likely a MIXED CONTENT block: non-loopback HTTP from an HTTPS page is not allowed (loopback exception does not extend to LAN IPs).";
            } else if (lnaState.value === "denied") {
                why =
                    "Local Network Access permission DENIED — the browser blocked the public→loopback request.";
            } else if (lnaState.value === "prompt") {
                why =
                    "Local Network Access permission still on 'prompt' — approve the browser prompt, then retry.";
            } else if (lnaState.value === "granted") {
                why =
                    "LNA granted but fetch failed — likely CORS (bridge not allowing this origin) or the bridge is not running.";
            } else {
                why =
                    "Likely CORS (origin not allowed) or the bridge is not running on " +
                    u.host +
                    ".";
            }
        } catch {
            /* malformed URL — leave default */
        }
        return { ok: false, error: `${err.name}: ${err.message}`, why, url };
    }
}

const jsonHeaders = { headers: { "Content-Type": "application/json" } };

async function ping() {
    output.value = JSON.stringify(await call("/api/ping"), null, 2);
}
async function getSystem() {
    output.value = JSON.stringify(await call("/api/system"), null, 2);
}
async function getDevice() {
    output.value = JSON.stringify(await call("/api/device"), null, 2);
}
async function toggleDevice() {
    const current = await call("/api/device");
    const nextOn = !(current.data && (current.data as { on?: boolean }).on);
    const res = await call("/api/device", {
        method: "POST",
        ...jsonHeaders,
        body: JSON.stringify({ on: nextOn }),
    });
    output.value = JSON.stringify(res, null, 2);
    refreshLna();
}

onMounted(() => {
    refreshLna();
    markPageReady();
});
</script>

<template>
    <div class="mx-auto max-w-2xl px-4 py-8">
        <h1 class="text-xl font-bold tracking-tight">Hardware Bridge (PoC)</h1>
        <p class="mt-1 text-sm text-zinc-500">
            This page is served from
            <code class="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{{ pageOrigin }}</code>
            and calls a local service on your machine over HTTP.
        </p>

        <div class="mt-4 text-sm">
            <div>Browser: <span class="font-medium">{{ browser }}</span></div>
            <div class="mt-1 flex flex-wrap items-center gap-2">
                Local Network Access permission:
                <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold"
                    :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200':
                            lnaState === 'granted',
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200':
                            lnaState === 'prompt',
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200':
                            lnaState === 'denied',
                        'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200':
                            lnaState === 'unsupported' || lnaState === 'checking',
                    }"
                >
                    {{ lnaState }}
                </span>
                <span class="text-xs text-zinc-400">{{ lnaNote }}</span>
            </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2">
            <input
                v-model="bridgeUrl"
                type="text"
                class="w-64 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                aria-label="Bridge base URL"
            />
            <button
                class="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                @click="ping"
            >
                Ping
            </button>
            <button
                class="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                @click="getSystem"
            >
                Get system
            </button>
            <button
                class="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                @click="getDevice"
            >
                Get device
            </button>
            <button
                class="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                @click="toggleDevice"
            >
                Toggle device
            </button>
        </div>
        <p class="mt-1 text-xs text-zinc-400">
            Toggle writes via POST → proves bidirectional browser→local-hardware interaction.
        </p>

        <h2 class="mt-6 text-sm font-semibold">Result</h2>
        <pre
            class="mt-1 overflow-auto rounded bg-zinc-100 p-3 text-xs dark:bg-zinc-900"
        ><code>{{ output }}</code></pre>

        <h2 class="mt-6 text-sm font-semibold">Failure modes</h2>
        <ul class="mt-1 list-disc pl-5 text-xs text-zinc-500">
            <li>
                Mixed content block: only when targeting a non-loopback HTTP URL (e.g.
                <code>http://192.168.x.x</code>) from an HTTPS page.
            </li>
            <li>
                CORS failure: the bridge didn't return
                <code>Access-Control-Allow-Origin</code> for this origin.
            </li>
            <li>
                LNA denied/prompt (Chrome 142+): a TypeError while the pill reads
                <code>prompt</code>/<code>denied</code>. Firefox/Safari show no prompt.
            </li>
        </ul>
    </div>
</template>