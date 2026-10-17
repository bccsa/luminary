import { computed } from "vue";
import {
    DocType,
    AclPermission,
    hasAnyPermission,
    useHybridQueryWithState,
    type GlobalAffinityDto,
    type AffinityMap,
} from "luminary-shared";

/**
 * Data layer for the CMS "community interest" panel — the audience-wide affinity singleton
 * (`DocType.GlobalAffinity`), aggregated server-side from app clients' contributions.
 *
 * Read-only by design: the server is the document's only writer, so there is no save path
 * here. Editors act on it indirectly, by copying tags into the DefaultAffinity cold-start
 * baseline (`useDefaultAffinity`'s `saveAffinity`).
 *
 * Like DefaultAffinity, the type is not synced into the CMS's IndexedDB — HybridQuery serves
 * it over REST and keeps it live via on-demand socket rooms. Must be called synchronously in
 * a component `setup` so the live subscription tears down on unmount.
 */
export function useGlobalAffinity() {
    const canView = computed(() => hasAnyPermission(DocType.GlobalAffinity, AclPermission.CmsView));

    const { output: source, isFetching: isLoading } = useHybridQueryWithState<GlobalAffinityDto>(
        () => ({ selector: { type: DocType.GlobalAffinity } }),
        { live: true },
    );

    // Exactly one row expected (the singleton) — undefined until the server has written it.
    const current = computed(() => source.value[0]);
    const affinity = computed<AffinityMap>(() => current.value?.affinity ?? {});
    const contributionCount = computed(() => current.value?.contributionCount ?? 0);
    const lastUpdatedUtc = computed(() => current.value?.lastDecayUtc ?? 0);

    return { canView, current, affinity, contributionCount, lastUpdatedUtc, isLoading };
}
