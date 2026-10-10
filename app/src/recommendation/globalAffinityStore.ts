import { liveQuery } from "dexie";
import { ref } from "vue";
import { db, GLOBAL_AFFINITY_ID, type AffinityMap, type GlobalAffinityDto } from "luminary-shared";

/**
 * The audience-wide affinity map, read live from the local copy of the synced
 * `GlobalAffinity` singleton. Aggregated server-side from many clients' contributions, so
 * it reflects what the audience engages with rather than this user — it feeds the community
 * feed only and never touches the personal profile or its ranking.
 *
 * Empty until an administrator grants a group `Contribute` and contributions accumulate.
 */
export const globalAffinity = ref<AffinityMap>({});

/**
 * The singleton's own groups, echoed back on a contribution purely to satisfy the change
 * request's non-empty `memberOf` constraint — the server replaces it with the stored doc's
 * groups regardless, so this is shape, not authority. Empty until the doc has synced.
 */
export const globalAffinityMemberOf = ref<string[]>([]);

let started = false;

/**
 * Start watching the local (synced) `GlobalAffinity` singleton. Idempotent — call once after
 * `luminary-shared`'s `init()` (and therefore `initDatabase()`) has resolved. Runs for the
 * app's lifetime; no teardown needed.
 */
export function initGlobalAffinitySync() {
    if (started) return;
    started = true;

    liveQuery(() => db.get<GlobalAffinityDto>(GLOBAL_AFFINITY_ID)).subscribe((doc) => {
        globalAffinity.value = doc?.affinity ?? {};
        globalAffinityMemberOf.value = doc?.memberOf ?? [];
    });
}
