import type {
    DownloadChapter,
    DownloadEntry,
    DownloadProgress,
    DownloadStorage,
} from "@/build-time/contracts/downloads/contract";
import { isRefreshing, isVolumeUnmounted } from "./badges";

export function doneUnitIds(entry: DownloadEntry): Set<string> {
    return new Set(entry.units.filter((unit) => unit.state === "done").map((unit) => unit.unitId));
}

/** What the download holds of a chapter: nothing planned, some of it still to come, or all of it. */
export function chapterState(
    chapter: DownloadChapter | undefined,
    done: ReadonlySet<string>,
): "none" | "pending" | "done" {
    if (!chapter || chapter.unitIds.length === 0) return "none";
    return chapter.unitIds.every((id) => done.has(id)) ? "done" : "pending";
}

/** The item's files are in and at least one chapter (or the one unit of an item without chapters) is complete. */
export function hasPlayableChapter(entry: DownloadEntry): boolean {
    if (entry.item.state !== "done") return false;
    const done = doneUnitIds(entry);
    if (entry.chapters.length === 0) return entry.units.length > 0 && done.size > 0;
    return entry.chapters.some((chapter) => chapterState(chapter, done) === "done");
}

/** Whether the download can be played from the device now. */
export function isPlayable(entry: DownloadEntry, storage: DownloadStorage | null): boolean {
    return (
        entry.status !== "revoked" &&
        entry.key !== "missing" &&
        !isVolumeUnmounted(entry, storage?.volumes ?? []) &&
        hasPlayableChapter(entry)
    );
}

/** The bytes the download takes on its volume once every planned part is in. */
export function plannedBytes(entry: DownloadEntry): number {
    return entry.item.bytes + entry.units.reduce((sum, unit) => sum + unit.bytes, 0);
}

/** The bytes the download has stored so far. */
export function storedBytes(entry: DownloadEntry, progress?: DownloadProgress): number {
    if (progress) return progress.bytesDone;
    const item = entry.item.state === "done" ? entry.item.bytes : 0;
    return (
        item +
        entry.units.filter((unit) => unit.state === "done").reduce((sum, u) => sum + u.bytes, 0)
    );
}

/** What is left to transfer, for the mobile-data question. */
export function remainingBytes(entry: DownloadEntry, progress?: DownloadProgress): number {
    if (progress) return Math.max(0, progress.bytesTotal - progress.bytesDone);
    return Math.max(0, plannedBytes(entry) - storedBytes(entry));
}

/**
 * The download as the sheet's manage row and the Downloads page show it; a refreshing download is shown as complete.
 */
export function displayedStatus(
    entry: DownloadEntry,
    progress?: DownloadProgress,
): { status: DownloadEntry["status"]; reason: DownloadEntry["reason"]; progress: number } {
    if (isRefreshing(entry) || entry.status === "complete") {
        return {
            status: "complete",
            reason: isRefreshing(entry) ? null : entry.reason,
            progress: 1,
        };
    }
    const total = progress?.bytesTotal ?? plannedBytes(entry);
    const done = progress?.bytesDone ?? storedBytes(entry);
    return {
        status: entry.status,
        reason: entry.reason,
        progress: total > 0 ? Math.min(1, done / total) : 0,
    };
}

/** The i18n key of the line that says where a download stands, chosen as the sheet's manage row chooses it. */
export function statusKey(entry: DownloadEntry, progress?: DownloadProgress): string {
    const { status, reason } = displayedStatus(entry, progress);
    switch (status) {
        case "waiting":
            if (reason === "metered") return "downloads.status.waiting_metered";
            if (reason === "volume") return "downloads.status.waiting_volume";
            return "downloads.status.waiting";
        case "paused":
            if (reason === "no-space") return "downloads.status.no_space";
            if (reason === "interrupted") return "downloads.status.interrupted";
            return "downloads.status.paused";
        default:
            return `downloads.status.${status}`;
    }
}

/** Paused for a reason other than the viewer's own pause, or failed: what the resume banner is shown for. */
export function isInterrupted(entry: DownloadEntry): boolean {
    return entry.status === "failed" || (entry.status === "paused" && entry.reason !== "user");
}

/**
 * What "Resume all" resumes: every paused download (the viewer's own pauses too), every failed one, and with
 * mobile-data consent every download waiting for it that is not refreshing. The mobile-data question's size counts
 * exactly this set.
 */
export function resumedByResumeAll(entry: DownloadEntry, meteredConsent: boolean): boolean {
    return (
        entry.status === "paused" ||
        entry.status === "failed" ||
        (meteredConsent &&
            entry.status === "waiting" &&
            entry.reason === "metered" &&
            !isRefreshing(entry))
    );
}
