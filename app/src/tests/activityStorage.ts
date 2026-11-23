import { beforeEach, vi } from "vitest";
import {
    normalizeUserActivityDocument,
    userActivityDocumentId,
    type UserActivityEntry,
} from "luminary-shared";
import { clearLocalUserActivity, getUserActivitySource } from "@/userActivity/source";

export let activityDocs: Awaited<ReturnType<typeof getUserActivitySource>>["db"]["docs"];

/** Convert readable fixture keys to the persistent UUID contract. */
export function activityId(key: string): string {
    const match = /^highlighted:(.+):(\d+)-(\d+)$/.exec(key);
    if (match)
        return userActivityDocumentId({
            type: "highlighted",
            parentId: "",
            contentId: match[1],
            range: { start: Number(match[2]), end: Number(match[3]) },
        });
    const separator = key.indexOf(":");
    return userActivityDocumentId({
        type: key.slice(0, separator) as "liked" | "viewed",
        parentId: key.slice(separator + 1),
    });
}

export function setupActivityTests(): void {
    beforeEach(async () => {
        vi.useRealTimers();
        activityDocs = (await getUserActivitySource()).db.docs;
        await clearLocalUserActivity();
    });
}

/** Seed acknowledged activity fixtures without an outbound change. */
export async function seedUserActivity(
    input: UserActivityEntry | UserActivityEntry[],
): Promise<void> {
    const rows = Array.isArray(input) ? input : [input];
    const source = await getUserActivitySource();
    await source.db.docs.bulkPut(rows.map((row) => normalizeUserActivityDocument(row)));
}
