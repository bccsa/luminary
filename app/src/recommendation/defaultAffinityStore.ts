import { liveQuery } from "dexie";
import { ref } from "vue";
import {
    db,
    DEFAULT_AFFINITY_CONFIG,
    DEFAULT_AFFINITY_ID,
    type AffinityConfig,
    type AffinityMap,
    type DefaultAffinityDto,
} from "luminary-shared";

/**
 * The CMS-managed cold-start affinity map, read live from the local copy of the synced
 * `DefaultAffinity` singleton doc (synced like any other doc type — see `sync.ts`).
 * Consumers may use it to seed an otherwise-new local profile; it is not user state
 * and is never written back to the server.
 */
export const defaultAffinity = ref<AffinityMap | undefined>(undefined);

/**
 * The CMS-managed affinity engine tuning config, read from the same synced singleton.
 * Always a complete config — falls back to `DEFAULT_AFFINITY_CONFIG` so callers never
 * need to null-check it.
 */
export const affinityConfig = ref<AffinityConfig>(DEFAULT_AFFINITY_CONFIG);

let started = false;

/**
 * Start watching the local (synced) `DefaultAffinity` singleton and keep
 * `defaultAffinity`/`affinityConfig` aligned with it. Idempotent — call once after
 * `luminary-shared`'s `init()` (and therefore `initDatabase()`) has resolved. Runs
 * for the app's lifetime; no teardown needed.
 */
export function initDefaultAffinitySync() {
    if (started) return;
    started = true;

    liveQuery(() => db.get<DefaultAffinityDto>(DEFAULT_AFFINITY_ID)).subscribe((doc) => {
        defaultAffinity.value = doc?.affinity;
        affinityConfig.value = doc?.config ?? DEFAULT_AFFINITY_CONFIG;
    });
}
