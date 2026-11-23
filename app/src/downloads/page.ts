import type {
    DownloadEntry,
    DownloadReason,
    DownloadVolume,
} from "@/build-time/contracts/downloads/contract";
import { isPartial, isRefreshing, isVolumeUnmounted } from "./badges";
import { chapterState, doneUnitIds, plannedBytes, storedBytes } from "./entries";

/** How My Downloads orders its list. */
export const DOWNLOAD_SORTS = ["newest", "oldest", "largest"] as const;
export type DownloadSort = (typeof DOWNLOAD_SORTS)[number];

/** What a download's card offers, in the order it shows them. */
export type CardAction =
    | "fetchKey"
    | "useMobileData"
    | "resume"
    | "retry"
    | "pause"
    | "cancel"
    | "addChapters"
    | "remove";

/** What a card says beside its status line, and the buttons it offers. */
export type CardView = {
    /** The i18n key of why the download needs the viewer, or why it cannot play; null when all is well. */
    attention: string | null;
    actions: CardAction[];
};

const FAILED_KEYS: Partial<Record<DownloadReason, string>> = {
    "source-changed": "downloads.page.attention.source_changed",
    "source-gone": "downloads.page.attention.source_gone",
    integrity: "downloads.page.attention.integrity",
    http: "downloads.page.attention.http",
    "no-space": "downloads.page.attention.no_space",
    interrupted: "downloads.page.attention.interrupted",
};

/** The list in the order the viewer chose; size is what each download takes once every planned part is in. */
export function sortDownloads(
    entries: readonly DownloadEntry[],
    order: DownloadSort,
): DownloadEntry[] {
    const sorted = [...entries];
    switch (order) {
        case "newest":
            return sorted.sort((a, b) => b.createdAt - a.createdAt);
        case "oldest":
            return sorted.sort((a, b) => a.createdAt - b.createdAt);
        case "largest":
            return sorted.sort(
                (a, b) => plannedBytes(b) - plannedBytes(a) || b.createdAt - a.createdAt,
            );
    }
}

/**
 * What deleting `entries` frees: what each has stored, leaving out those `skipped` (being played), which the engine
 * keeps.
 */
export function freedBytes(
    entries: readonly DownloadEntry[],
    skipped: ReadonlySet<string>,
): number {
    return entries
        .filter((entry) => !skipped.has(entry.downloadId))
        .reduce((sum, entry) => sum + storedBytes(entry), 0);
}

/** Chapters downloaded, of all the item's chapters; undefined for an item without chapters. */
export function chapterCount(entry: DownloadEntry): { done: number; total: number } | undefined {
    if (entry.chapters.length === 0) return undefined;
    const done = doneUnitIds(entry);
    return {
        done: entry.chapters.filter((c) => chapterState(c, done) === "done").length,
        total: entry.chapters.length,
    };
}

/**
 * The card's attention text and actions, from the download's status, reason, key and volume. A card on a card that
 * is not inserted, or of a revoked download, can only be removed: nothing else would work until that changes.
 */
export function cardView(
    entry: DownloadEntry,
    volumes: readonly DownloadVolume[],
    options: { canAddChapters: boolean },
): CardView {
    if (entry.status === "revoked") {
        return {
            attention:
                entry.reason === "access"
                    ? "downloads.page.attention.revoked_access"
                    : "downloads.page.attention.revoked",
            actions: ["remove"],
        };
    }
    if (isVolumeUnmounted(entry, volumes)) {
        return { attention: "downloads.page.attention.card_unmounted", actions: ["remove"] };
    }
    const keyMissing = entry.key === "missing";
    const head: CardAction[] = keyMissing ? ["fetchKey"] : [];
    const add: CardAction[] = options.canAddChapters && isPartial(entry) ? ["addChapters"] : [];
    const keyAttention = keyMissing ? "downloads.page.attention.key_missing" : null;

    // A refreshing download fetches only what the viewer never asked for, so it is shown as downloaded.
    if (entry.status === "complete" || isRefreshing(entry)) {
        return { attention: keyAttention, actions: [...head, ...add, "remove"] };
    }
    switch (entry.status) {
        case "failed":
            return {
                attention:
                    keyAttention ??
                    (entry.reason && FAILED_KEYS[entry.reason]) ??
                    "downloads.page.attention.failed",
                actions: [...head, "retry", "cancel", ...add, "remove"],
            };
        case "paused":
            return {
                attention:
                    keyAttention ??
                    (entry.reason && entry.reason !== "user"
                        ? (FAILED_KEYS[entry.reason] ?? "downloads.page.attention.interrupted")
                        : null),
                actions: [...head, "resume", "cancel", ...add, "remove"],
            };
        case "waiting":
            if (entry.reason === "metered") {
                return {
                    attention: keyAttention ?? "downloads.page.attention.metered",
                    actions: [...head, "useMobileData", "pause", "cancel", ...add, "remove"],
                };
            }
            return {
                attention: keyAttention,
                actions: [...head, "pause", "cancel", ...add, "remove"],
            };
        default:
            return {
                attention: keyAttention,
                actions: [...head, "pause", "cancel", ...add, "remove"],
            };
    }
}
