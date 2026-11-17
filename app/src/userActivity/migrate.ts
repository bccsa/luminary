/**
 * One-time move of activity that predates this database: likes from `userPreferences`
 * (localStorage) and highlights from the shared `luminaryInternals` store.
 *
 * Neither pass ever overwrites a row already present here: a recorded activity is the more
 * recent truth, so a stale source entry must not revive something the user has since removed.
 */

import {
    db,
    config,
    DocType,
    HttpReq,
    isConnected,
    type BaseDocumentDto,
    type HighlightRange,
    type Uuid,
} from "luminary-shared";
import { getHighlightRanges, getLegacyHighlightHtml } from "@/recommendation/highlightStore";
import { rangesFromLegacyHtml } from "@/util/highlightRanges";
import { addMissingUserActivity, userActivityId } from "./store";

function legacyRangesOfPayload(payload: unknown): HighlightRange[] {
    if (!payload || typeof payload !== "object" || !("ranges" in payload)) return [];
    const parsed = getHighlightRanges(payload);
    return parsed ?? [];
}

/** A like as `userPreferences` stored it. */
export type LegacyLike = { id: Uuid; ts: number };

// Separate from the earlier likes/article-highlight migration already run by existing installs.
export const USER_ACTIVITY_MIGRATION_KEY = "userActivityPassagesMigrated";

/**
 * Resolve missing content in bounded requests. Only a valid response proves that an absent
 * content doc is gone; transport errors leave its highlights available for the next start.
 */
async function lookupMissingContent(ids: string[]): Promise<{
    docs: BaseDocumentDto[];
    checked: Set<string>;
}> {
    const docs: BaseDocumentDto[] = [];
    const checked = new Set<string>();
    if (!isConnected.value || !ids.length) return { docs, checked };

    const http = new HttpReq(config.apiUrl || "");
    for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const response = await http.post("query", {
            selector: { type: DocType.Content, _id: { $in: batch } },
            limit: batch.length,
            identifier: "highlightMigration",
        });
        if (!response || !Array.isArray(response.docs)) continue;
        docs.push(...response.docs);
        batch.forEach((id) => checked.add(id));
    }
    return { docs, checked };
}

/** Write the rows the database does not already hold, and report how many were added. */
const addMissing = addMissingUserActivity;

/** Likes already store the post id, so they convert directly. The caller clears the source. */
export async function migrateLikesToUserActivity(likes?: LegacyLike[]): Promise<number> {
    if (!likes?.length) return 0;

    return addMissing(
        likes.map((like) => ({
            _id: userActivityId({ type: "liked", parentId: like.id }),
            type: "liked",
            parentId: like.id,
            updatedTimeUtc: like.ts,
        })),
    );
}

/**
 * Highlights are stored per translation. Entries written since the post was stored with them
 * carry it; older ones are matched to local Content docs, then looked up remotely once.
 * Offline or failed lookups keep unresolved entries for the next start. A successful lookup
 * drops entries that still cannot be resolved. Migrated entries leave the legacy store.
 */
export async function migrateHighlightsToUserActivity(): Promise<number> {
    const stored = await db.getLuminaryInternals("highlights");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return 0;

    const entries = Object.entries(stored as Record<string, unknown>)
        .map(([contentId, value]) => ({ contentId, ranges: rangesOf(value), value }))
        .filter((entry) => entry.ranges.length > 0);

    if (!entries.length) {
        await db.luminaryInternals.delete("highlights");
        return 0;
    }

    const contentDocs = await db.docs.bulkGet(entries.map((entry) => entry.contentId));
    const missingIds = entries
        .filter((entry, i) => !parentIdOf(entry.value) && !contentDocs[i]?.parentId)
        .map((entry) => entry.contentId);
    const remote = await lookupMissingContent(missingIds);
    const remoteParents = new Map(remote.docs.map((doc) => [doc._id, doc.parentId]));

    const rows = entries
        .map((entry, i) => ({
            entry,
            parentId:
                parentIdOf(entry.value) ??
                (contentDocs[i] as BaseDocumentDto | undefined)?.parentId ??
                remoteParents.get(entry.contentId),
        }))
        .filter((row): row is { entry: (typeof entries)[number]; parentId: Uuid } => !!row.parentId)
        .map(({ entry, parentId }) => ({
            parentId,
            contentId: entry.contentId,
            updatedTimeUtc: updatedAtOf(entry.value),
            ranges: entry.ranges,
        }))
        .flatMap(({ parentId, contentId, updatedTimeUtc, ranges }) =>
            ranges.map((range) => ({
                _id: userActivityId({ type: "highlighted", contentId, parentId, range }),
                type: "highlighted" as const,
                contentId,
                parentId,
                // Entries predating timestamps sort last rather than claiming to be new.
                updatedTimeUtc,
                payload: { range },
            })),
        );

    const added = await addMissing(rows);

    // Keep only unresolved entries (missing parent/content); remove key when fully migrated.
    const unresolved = entries.filter((_, i) => {
        const row = contentDocs[i] as BaseDocumentDto | undefined;
        return (
            !parentIdOf(entries[i].value) &&
            !row?.parentId &&
            !remote.checked.has(entries[i].contentId)
        );
    });
    if (!unresolved.length) {
        await db.luminaryInternals.delete("highlights");
    } else {
        await db.setLuminaryInternals(
            "highlights",
            Object.fromEntries(unresolved.map((entry) => [entry.contentId, entry.value])),
        );
    }

    return added;
}

/** Expand legacy one-row-per-content highlights into one-row-per-passage rows. */
export async function migrateLegacyHighlightRowsToPassages(): Promise<number> {
    const legacy = await db.userActivity
        .where("type")
        .equals("highlighted")
        .filter(
            (row) =>
                !row.deleted && !!row.contentId && legacyRangesOfPayload(row.payload).length > 0,
        )
        .toArray();

    if (!legacy.length) return 0;

    let added = 0;

    for (const row of legacy) {
        const ranges = legacyRangesOfPayload(row.payload);
        const expanded = ranges.map((range) => ({
            _id: userActivityId({
                type: "highlighted",
                contentId: row.contentId as Uuid,
                parentId: row.parentId,
                range,
            }),
            type: "highlighted" as const,
            contentId: row.contentId,
            parentId: row.parentId,
            updatedTimeUtc: row.updatedTimeUtc,
            payload: { range },
        }));

        added += await addMissing(expanded);
        await db.userActivity.delete(row._id);
    }

    return added;
}

/** Reads either stored shape, converting a legacy HTML snapshot to ranges over its own text. */
function rangesOf(value: unknown): HighlightRange[] {
    const ranges = getHighlightRanges(value);
    if (ranges?.length) return ranges;

    const html = getLegacyHighlightHtml(value);
    return html ? rangesFromLegacyHtml(html) : [];
}

/** The post stored with the entry, for highlights written since it was carried. */
function parentIdOf(value: unknown): Uuid | undefined {
    if (value && typeof value === "object" && "parentId" in value) {
        const parentId = (value as { parentId: unknown }).parentId;
        if (typeof parentId === "string" && parentId) return parentId;
    }
    return undefined;
}

function updatedAtOf(value: unknown): number {
    if (value && typeof value === "object" && "updatedAt" in value) {
        const updatedAt = (value as { updatedAt: unknown }).updatedAt;
        if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) return updatedAt;
    }
    return 0;
}

/** Both passes, for the app to run once. */
export async function migrateToUserActivity(likes?: LegacyLike[]): Promise<void> {
    await migrateLegacyHighlightRowsToPassages();
    await migrateLikesToUserActivity(likes);
    await migrateHighlightsToUserActivity();
}

/** Run the passage migration even on devices that completed the earlier migration. */
export async function migrateUserActivityOnStartup(likes?: LegacyLike[]): Promise<void> {
    if (localStorage.getItem(USER_ACTIVITY_MIGRATION_KEY)) return;
    await migrateToUserActivity(likes);
    if (!(await db.getLuminaryInternals("highlights"))) {
        localStorage.setItem(USER_ACTIVITY_MIGRATION_KEY, "true");
    }
}
