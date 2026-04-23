import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import {
    DocType,
    userDataIds,
    type HighlightEntry,
    type UserContentDto,
    type UserSettingsDto,
    type Uuid,
} from "../types";
import { currentUserId } from "./session";

/**
 * Public user-data API. Reads are served from Dexie (instant, offline-
 * capable). Writes go through the shared local-first pipeline: `db.upsert`
 * persists to Dexie and enqueues a `LocalChange`, and the existing
 * `syncLocalChanges` watcher pushes it to `/changerequest` on connect.
 * The server routes user-data types to the partitioned userdata DB, and
 * broadcasts back via socket to reach the user's other devices.
 *
 * Every write requires `currentUserId` to be set (populated by the
 * socket `clientConfig` handler after login). Anonymous/unprovisioned
 * callers get a thrown error rather than silent no-op — the app layer
 * should hide the user-data UI in that state, so hitting this is a bug.
 */

function requireUserId(): Uuid {
    const id = currentUserId.value;
    if (!id) {
        throw new Error(
            "userDataApi: no current user — anonymous or unprovisioned caller cannot persist user data",
        );
    }
    return id;
}

async function readUserContent(userId: Uuid, contentId: Uuid): Promise<UserContentDto | null> {
    const _id = userDataIds.userContent(userId, contentId);
    const doc = (await db.docs.get(_id)) as UserContentDto | undefined;
    return doc ?? null;
}

function blankUserContent(userId: Uuid, contentId: Uuid, now: number): UserContentDto {
    return {
        _id: userDataIds.userContent(userId, contentId),
        type: DocType.UserContent,
        userId,
        contentId,
        createdAt: now,
        updatedTimeUtc: now,
    };
}

/* ─────────────────── content-scoped state ─────────────────── */

export async function getContentState(contentId: Uuid): Promise<UserContentDto | null> {
    const userId = currentUserId.value;
    if (!userId) return null;
    return readUserContent(userId, contentId);
}

export async function addHighlight(
    contentId: Uuid,
    entry: Omit<HighlightEntry, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<HighlightEntry> {
    const userId = requireUserId();
    const now = Date.now();
    const highlight: HighlightEntry = {
        id: entry.id ?? uuidv4(),
        color: entry.color,
        text: entry.text,
        position: entry.position,
        createdAt: entry.createdAt ?? now,
    };

    const current = (await readUserContent(userId, contentId)) ?? blankUserContent(userId, contentId, now);
    const next: UserContentDto = {
        ...current,
        highlights: [...(current.highlights ?? []), highlight],
        updatedTimeUtc: now,
    };
    await db.upsert({ doc: next });
    return highlight;
}

export async function removeHighlight(contentId: Uuid, highlightId: string): Promise<void> {
    const userId = requireUserId();
    const current = await readUserContent(userId, contentId);
    if (!current?.highlights?.length) return;
    const remaining = current.highlights.filter((h) => h.id !== highlightId);
    if (remaining.length === current.highlights.length) return;

    const now = Date.now();

    // The server's merge-on-write unions highlights by id — a plain
    // upsert with the removed highlight omitted would be re-added. The
    // correct removal path is therefore a soft-delete of the whole doc
    // (via deleteReq) followed by a fresh upsert if any state remains.
    // Doing both on the client queues two local-changes; syncLocalChanges
    // pushes them in order so the server sees DELETE then CREATE.
    await db.upsert({
        doc: { ...current, deleteReq: now },
        overwriteLocalChanges: true,
    });

    const nextHasState = remaining.length > 0 || current.readingPos !== undefined;
    if (nextHasState) {
        // Re-create with the remaining state. `_rev` is stripped because
        // the previous doc has been deleted — this is a fresh insert.
        const next: UserContentDto = {
            _id: current._id,
            type: DocType.UserContent,
            userId: current.userId,
            contentId: current.contentId,
            createdAt: current.createdAt,
            updatedTimeUtc: now,
            readingPos: current.readingPos,
            highlights: remaining.length > 0 ? remaining : undefined,
        };
        await db.upsert({ doc: next });
    }
}

export async function saveReadingPos(contentId: Uuid, readingPos: number): Promise<void> {
    const userId = requireUserId();
    const now = Date.now();
    const current = (await readUserContent(userId, contentId)) ?? blankUserContent(userId, contentId, now);
    const next: UserContentDto = { ...current, readingPos, updatedTimeUtc: now };
    await db.upsert({ doc: next });
}

/* ─────────────────── global settings ─────────────────── */

export async function getSettings(): Promise<UserSettingsDto | null> {
    const userId = currentUserId.value;
    if (!userId) return null;
    const _id = userDataIds.settings(userId);
    const doc = (await db.docs.get(_id)) as UserSettingsDto | undefined;
    return doc ?? null;
}

export async function updateSettings(
    patch: Partial<Omit<UserSettingsDto, "_id" | "_rev" | "type" | "userId" | "createdAt">>,
): Promise<UserSettingsDto> {
    const userId = requireUserId();
    const now = Date.now();
    const _id = userDataIds.settings(userId);
    const current = ((await db.docs.get(_id)) as UserSettingsDto | undefined) ?? {
        _id,
        type: DocType.UserSettings,
        userId,
        createdAt: now,
        updatedTimeUtc: now,
    };
    const next: UserSettingsDto = { ...current, ...patch, updatedTimeUtc: now };
    await db.upsert({ doc: next });
    return next;
}
