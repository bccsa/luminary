import { computed, ref, watch, type ComputedRef } from "vue";
import type { DownloadsService } from "@/build-time/contracts/downloads/contract";

/** Which items the end of one counts down to: any, or only those playable from the device. */
export type AutoplayMode = "all" | "downloaded";

/**
 * Whether autoplay carries on only to downloaded items, beside the autoplay setting itself. Off unless the viewer
 * chooses it. Persisted to localStorage.
 */
export const autoplayDownloadedOnly = ref(
    localStorage.getItem("autoplayDownloadedOnly") === "true",
);
watch(autoplayDownloadedOnly, (on) => {
    localStorage.setItem("autoplayDownloadedOnly", String(on));
});

/** The mode for the setting and the connection: offline, only a downloaded item can play next. */
export function autoplayModeFor(downloadedOnly: boolean, online: boolean): AutoplayMode {
    return downloadedOnly || !online ? "downloaded" : "all";
}

export type AutoplayModeState = {
    mode: ComputedRef<AutoplayMode>;
    /** Offline the mode is forced: it shows, and the choice is dimmed. */
    locked: ComputedRef<boolean>;
    /** The viewer's choice; ignored while locked, so going online again restores what they had. */
    choose(mode: AutoplayMode): void;
};

/** The autoplay mode where there are downloads; undefined without a service, where autoplay plays anything. */
export function useAutoplayMode(
    service: DownloadsService | undefined,
): AutoplayModeState | undefined {
    if (!service) return undefined;
    const online = computed(() => service.network.value.online);
    return {
        mode: computed(() => autoplayModeFor(autoplayDownloadedOnly.value, online.value)),
        locked: computed(() => !online.value),
        choose(mode) {
            if (online.value) autoplayDownloadedOnly.value = mode === "downloaded";
        },
    };
}
