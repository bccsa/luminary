import type {
    DownloadBadge,
    DownloadEntry,
    DownloadProgress,
    DownloadReason,
    DownloadVolume,
} from "@/build-time/contracts/downloads/contract";

/** Reasons that clear by themselves or were the viewer's own choice, so they never ask for attention. */
const QUIET_REASONS: ReadonlySet<DownloadReason> = new Set(["network", "user", "access"]);

/** Only an item refresh is left: a few kilobytes the viewer did not ask for, so the download shows as complete. */
export function isRefreshing(entry: DownloadEntry): boolean {
    return (
        (entry.status === "queued" ||
            entry.status === "waiting" ||
            entry.status === "downloading") &&
        entry.item.state === "done" &&
        entry.units.every((unit) => unit.state === "done")
    );
}

export function needsAttention(entry: DownloadEntry): boolean {
    if (entry.status === "revoked") return false;
    if (entry.key === "missing") return true;
    if (entry.status === "failed") return true;
    return entry.reason !== null && !QUIET_REASONS.has(entry.reason) && !isRefreshing(entry);
}

export function isVolumeUnmounted(entry: DownloadEntry, volumes: readonly DownloadVolume[]) {
    return volumes.some((volume) => volume.id === entry.volumeId && !volume.mounted);
}

/** Some chapter was never planned, so the download holds only part of the item. */
export function isPartial(entry: DownloadEntry): boolean {
    return entry.chapters.some((chapter) => chapter.unitIds.length === 0);
}

export function progressPercent(progress: DownloadProgress | undefined): number {
    if (!progress || progress.bytesTotal <= 0) return 0;
    return Math.min(100, Math.max(0, Math.floor((100 * progress.bytesDone) / progress.bytesTotal)));
}

/**
 * The badge a tile and the native tool show for a parent, from its download, that download's progress and the
 * volumes the engine reports.
 */
export function badgeFor(
    entry: DownloadEntry | undefined,
    progress: DownloadProgress | undefined,
    volumes: readonly DownloadVolume[],
): DownloadBadge {
    if (!entry || entry.status === "revoked") return { state: "none" };
    if (isVolumeUnmounted(entry, volumes)) return { state: "unavailable" };
    if (needsAttention(entry)) return { state: "attention" };
    if (entry.status === "complete" || isRefreshing(entry)) {
        return { state: "downloaded", partial: isPartial(entry) };
    }
    return { state: "progress", percent: progressPercent(progress) };
}

export function sameBadge(a: DownloadBadge | undefined, b: DownloadBadge): boolean {
    if (!a || a.state !== b.state) return false;
    if (a.state === "progress" && b.state === "progress") return a.percent === b.percent;
    if (a.state === "downloaded" && b.state === "downloaded") return a.partial === b.partial;
    return true;
}
