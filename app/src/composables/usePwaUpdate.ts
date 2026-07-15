import { ref } from "vue";

// Check for a new deploy by polling version.json and comparing it to the build id baked into
// this bundle. This does not rely on a web service worker, so it also works if the app is
// opened in a future Capacitor WebView.
const UPDATE_CHECK_INTERVAL_MS = 5_000;

const needRefresh = ref(false);
let availableBuildId: string | undefined;

async function checkForUpdate() {
    try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (typeof buildId === "string" && buildId !== __APP_BUILD_ID__) {
            availableBuildId = buildId;
            needRefresh.value = true;
        }
    } catch {
        // Offline or transient network error — not a signal that an update is available.
    }
}

// Capacitor builds set this to "false": the app store already owns the update flow there, and
// a page-reload prompt is meaningless once the app ships inside a native binary.
if (import.meta.env.VITE_ENABLE_UPDATE_PROMPT !== "false") {
    setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    checkForUpdate();
}

export function usePwaUpdate() {
    return {
        needRefresh,
        // Keep normal HTML caching and give the accepted update a fresh cache key instead.
        // The old bundle has already confirmed this build exists through version.json, so this
        // navigation retrieves its index.html without affecting offline navigation otherwise.
        reload: () => {
            const url = new URL(window.location.href);
            url.searchParams.set("__build", availableBuildId ?? __APP_BUILD_ID__);
            window.location.replace(url);
        },
    };
}
