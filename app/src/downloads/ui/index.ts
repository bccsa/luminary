import type { DownloadsUi } from "@/build-time/contracts/downloads/contract";
import DownloadBadge from "./DownloadBadge.vue";
import ResumeBanner from "./ResumeBanner.vue";
import DeleteLocalDataOption from "./DeleteLocalDataOption.vue";
import WatchFilterSwitch from "./WatchFilterSwitch.vue";
import AutoplayModePill from "./AutoplayModePill.vue";

/** The components the service hands to consumers; each reads the service it is rendered under. */
export const downloadsUi: DownloadsUi = {
    DownloadBadge,
    ResumeBanner,
    DeleteLocalDataOption,
    WatchFilterSwitch,
    AutoplayModePill,
};
