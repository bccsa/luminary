import { DocType } from "../enums";
import { DbService } from "../db/db.service";

// Cache group name→ID map to avoid querying the DB on every JWT processing call
const GROUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let groupNameCache: Map<string, string> | undefined;
let groupCacheTimestamp = 0;

/**
 * Get a cached map of group names (lowercased) to group IDs.
 * Re-fetches from the DB when the cache expires.
 */
export async function getGroupNameToIdMap(
    db: DbService,
): Promise<Map<string, string>> {
    const now = Date.now();
    if (groupNameCache && now - groupCacheTimestamp < GROUP_CACHE_TTL_MS) {
        return groupNameCache;
    }

    const groupDocs = await db.getDocsByType(DocType.Group);
    const map = new Map<string, string>();
    for (const g of groupDocs.docs ?? []) {
        const group = g as Record<string, unknown>;
        if (group.name && group._id) {
            map.set(String(group.name).toLowerCase(), String(group._id));
        }
    }

    groupNameCache = map;
    groupCacheTimestamp = now;
    return map;
}

/**
 * Clear the group name cache. Useful for testing.
 */
export function clearGroupNameCache() {
    groupNameCache = undefined;
    groupCacheTimestamp = 0;
}
