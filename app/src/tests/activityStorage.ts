import { beforeEach, vi } from "vitest";
import { DocType, type UserActivityEntry } from "luminary-shared";
import { clearLocalUserActivity, getUserActivitySource } from "@/userActivity/source";

export let activityDocs: Awaited<ReturnType<typeof getUserActivitySource>>["db"]["docs"];

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
    await source.db.docs.bulkPut(
        rows.map((row) => ({
            ...row,
            type: DocType.UserActivity,
            activityType: row.type,
            activityTimeUtc: row.updatedTimeUtc,
        })),
    );
}
