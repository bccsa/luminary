import { ref } from "vue";
import type { AppUpdateService, AvailableUpdate } from "@/build-time/contracts/app-update/contract";

export const UPDATE_CHECK_INTERVAL_MS = 5_000;

/**
 * Browser {@link AppUpdateService}: finds a new deploy by polling `version.json` and comparing
 * it to the build id baked into this bundle. It doesn't rely on a service worker.
 */
export class WebAppUpdateService implements AppUpdateService {
    readonly installedVersion = ref<string | undefined>(undefined);
    readonly available = ref<AvailableUpdate | undefined>(undefined);
    readonly checkedAt = ref<number | undefined>(undefined);

    private timer: ReturnType<typeof setInterval> | undefined;

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS);
        this.check();
    }

    async check(): Promise<void> {
        try {
            const res = await fetch("/version.json", { cache: "no-store" });
            if (!res.ok) return;
            const { buildId } = await res.json();
            this.checkedAt.value = Date.now();
            if (typeof buildId === "string" && buildId !== __APP_BUILD_ID__) {
                if (this.available.value?.version !== buildId) {
                    this.available.value = { kind: "reload", version: buildId };
                }
            }
        } catch {
            // Offline or transient network error — not a signal that an update is available.
        }
    }

    // Keep normal HTML caching and give the accepted update a fresh cache key instead.
    // The old bundle has already confirmed this build exists through version.json, so this
    // navigation retrieves its index.html without affecting offline navigation otherwise.
    applyUpdate(): void {
        const buildId = this.available.value?.version;
        if (!buildId) return;
        const url = new URL(window.location.href);
        url.searchParams.set("__build", buildId);
        window.location.replace(url);
    }
}
