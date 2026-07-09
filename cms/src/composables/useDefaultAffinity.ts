import { computed, nextTick } from "vue";
import {
    DocType,
    AclPermission,
    hasAnyPermission,
    useHybridQueryWithState,
    toEditable,
    DEFAULT_AFFINITY_ID,
    type DefaultAffinityDto,
    type AffinityMap,
    type ChangeReqAckDto,
} from "luminary-shared";

/**
 * Data layer for the CMS "default affinity" settings modal — the CMS-managed singleton
 * cold-start baseline profile (`DocType.DefaultAffinity`) new users' recommendations are
 * cloned from at first login (see `AuthIdentityService.getAffinity`).
 *
 * **Why HybridQuery in API-only mode.** Like AutoGroupMappings, DefaultAffinity is a
 * non-synced type — never mirrored into IndexedDB. Because the type is absent from the sync
 * engine's `syncList`, HybridQuery fetches it over REST and keeps it live by subscribing to
 * the type's socket rooms on demand, and `toEditable.save()` POSTs straight to
 * `/changerequest` (no Dexie write) — the same mechanism `useAutoGroupMappings` uses.
 *
 * Must be called synchronously in a component `setup` so the live subscription tears down
 * on unmount.
 */
export function useDefaultAffinity() {
    const canView = computed(() =>
        hasAnyPermission(DocType.DefaultAffinity, AclPermission.CmsView),
    );
    const canEdit = computed(() => hasAnyPermission(DocType.DefaultAffinity, AclPermission.Edit));

    // Non-synced type, served API-only (see header comment). No persistOffline.
    const { output: source, isFetching: isLoading } = useHybridQueryWithState<DefaultAffinityDto>(
        () => ({ selector: { type: DocType.DefaultAffinity } }),
        { live: true },
    );
    const { editable, save } = toEditable<DefaultAffinityDto>(source, {
        filterFn: (item) => ({ ...item }),
    });

    // Exactly one row expected (the singleton) — undefined before it has ever been created.
    const current = computed(() => editable.value[0]);

    /**
     * Create or update the singleton with a new affinity map. Stages the doc into the
     * editable array (replacing the existing row or appended as new), then persists via
     * {@link toEditable}'s `save` — which POSTs to `/changerequest` for this non-synced type.
     */
    async function saveAffinity(
        affinity: AffinityMap,
        memberOf: string[],
    ): Promise<ChangeReqAckDto | undefined> {
        const doc: DefaultAffinityDto = current.value
            ? { ...current.value, affinity }
            : {
                  _id: DEFAULT_AFFINITY_ID,
                  type: DocType.DefaultAffinity,
                  updatedTimeUtc: Date.now(),
                  memberOf,
                  affinity,
              };
        const idx = editable.value.findIndex((d) => d._id === doc._id);
        if (idx >= 0) editable.value[idx] = doc;
        else editable.value.push(doc);
        // Let toEditable's dirty-tracking watchers flush so save()'s internal isEdited check
        // sees the staged edit (mirrors useAutoGroupMappings).
        await nextTick();
        return save(doc._id);
    }

    return { canView, canEdit, current, isLoading, saveAffinity };
}
