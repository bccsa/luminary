import type { SyncListEntry } from "./types";

const time = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const strings = (value: unknown) =>
    Array.isArray(value) && value.every((v) => typeof v === "string");

/** Corrupt progress is replayed; document and outbound-queue data are never reset here. */
export function validSyncProgress(value: unknown): value is SyncListEntry[] {
    return (
        Array.isArray(value) &&
        value.every((entry) => {
            if (
                !entry ||
                typeof entry.chunkType !== "string" ||
                !strings(entry.memberOf) ||
                !entry.memberOf.length ||
                !time(entry.blockStart) ||
                !time(entry.blockEnd) ||
                entry.blockStart < entry.blockEnd ||
                (entry.eof !== undefined && typeof entry.eof !== "boolean") ||
                (entry.eof === true && entry.blockEnd !== 0) ||
                (entry.publishDateMin !== undefined &&
                    !Number.isSafeInteger(entry.publishDateMin)) ||
                (entry.publishDateMax !== undefined &&
                    !Number.isSafeInteger(entry.publishDateMax)) ||
                (entry.publishDateMin !== undefined &&
                    entry.publishDateMax !== undefined &&
                    entry.publishDateMin > entry.publishDateMax) ||
                (entry.languages !== undefined && !strings(entry.languages))
            )
                return false;
            const page = entry.pendingPage;
            if (page === undefined) return true;
            return (
                !!page &&
                typeof page === "object" &&
                !Array.isArray(page) &&
                (page.previousEof === undefined || typeof page.previousEof === "boolean") &&
                (page.provisional === undefined || typeof page.provisional === "boolean") &&
                time(page.start) &&
                time(page.end) &&
                page.start >= page.end &&
                typeof page.queryKey === "string" &&
                page.queryKey.length > 0 &&
                (page.newest === undefined ||
                    (time(page.newest) && page.newest <= page.start && page.newest >= page.end)) &&
                (page.after === undefined ||
                    (page.after &&
                        time(page.newest) &&
                        time(page.after.updatedTimeUtc) &&
                        page.after.updatedTimeUtc <= page.newest &&
                        page.after.updatedTimeUtc <= page.start &&
                        page.after.updatedTimeUtc >= page.end &&
                        typeof page.after.id === "string" &&
                        page.after.id.length > 0))
            );
        })
    );
}
