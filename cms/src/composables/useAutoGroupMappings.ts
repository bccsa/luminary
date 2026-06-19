import { computed, nextTick, ref, watch } from "vue";
import {
    db,
    DocType,
    AclPermission,
    AckStatus,
    hasAnyPermission,
    useDexieLiveQuery,
    useHybridQuery,
    toEditable,
    type AutoGroupMappingsDto,
    type AuthProviderDto,
    type GroupDto,
    type Uuid,
    type ChangeReqAckDto,
} from "luminary-shared";

/**
 * Data layer for the Auto Group Mappings admin screen: live mappings + auth providers via
 * {@link useHybridQuery}, the editable mappings array + dirty tracking via {@link toEditable},
 * and the create/update/delete primitives. UI concerns (filters, modal, notifications) stay
 * with the caller.
 *
 * **Why HybridQuery in API-only mode.** AutoGroupMappings are a non-synced type — never
 * mirrored into IndexedDB (ADR 0010). Because the type is absent from the sync engine's
 * `syncList`, both `typeIsInSyncList` and `isSyncableDoc` report false for it, so HybridQuery
 * fetches it over REST and keeps it live by subscribing to the type's socket rooms on demand,
 * and `toEditable.save()` POSTs each change straight to `/changerequest` (no Dexie write).
 * AuthProvider, by contrast, IS synced, so its HybridQuery reads Dexie-first.
 *
 * Must be called synchronously in a component `setup` so the live subscriptions tear down on
 * unmount (HybridQuery / useDexieLiveQuery register `onScopeDispose`).
 */
export function useAutoGroupMappings() {
    const canView = computed(() => hasAnyPermission(DocType.AutoGroupMappings, AclPermission.View));
    const canEdit = computed(() => hasAnyPermission(DocType.AutoGroupMappings, AclPermission.Edit));

    // Mappings — non-synced type, served API-only (see header comment). No persistOffline.
    const mappingsSource = useHybridQuery<AutoGroupMappingsDto>(
        () => ({ selector: { type: DocType.AutoGroupMappings } }),
        { live: true },
    );
    const mappingEditable = toEditable<AutoGroupMappingsDto>(mappingsSource, {
        filterFn: (item) => ({ ...item }),
    });
    const mappings = mappingEditable.editable;

    // Auth providers (read-only here) — a synced type, so Dexie-first HybridQuery.
    const providers = useHybridQuery<AuthProviderDto>(
        () => ({ selector: { type: DocType.AuthProvider } }),
        { live: true, persistOffline: true },
    );

    const groups = useDexieLiveQuery(
        () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
        { initialValue: [] as GroupDto[] },
    );

    // HybridQuery exposes no loading signal; settle on the first source emission (output is
    // reassigned even for an empty result, so this fires for empty sets too — same pattern as
    // useContentBrowseQuery).
    const isLoading = ref(true);
    const stopLoading = watch(
        mappingsSource,
        () => {
            isLoading.value = false;
            stopLoading();
        },
        { flush: "post" },
    );

    /**
     * Create or update a mapping. The doc is staged into the editable array (replacing an
     * existing row or appended as a new one), then persisted via {@link toEditable}'s `save` —
     * which POSTs to `/changerequest` for this non-synced type. Returns the change-request ack.
     */
    async function saveMapping(doc: AutoGroupMappingsDto): Promise<ChangeReqAckDto | undefined> {
        const idx = mappings.value.findIndex((m) => m._id === doc._id);
        if (idx >= 0) mappings.value[idx] = doc;
        else mappings.value.push(doc);
        // Let toEditable's dirty-tracking watchers flush so save()'s internal isEdited check
        // sees the staged edit (mirrors useAuthProviders / the overview's prior nextTick).
        await nextTick();
        return mappingEditable.save(doc._id);
    }

    /** Flag a mapping for deletion and persist (POST delete for this non-synced type). */
    async function deleteMapping(id: Uuid): Promise<ChangeReqAckDto | undefined> {
        const mapping = mappings.value.find((m) => m._id === id);
        if (!mapping) return { ack: AckStatus.Accepted };
        mapping.deleteReq = 1;
        await nextTick();
        return mappingEditable.save(id);
    }

    return {
        canView,
        canEdit,
        mappings,
        providers,
        groups,
        isLoading,
        saveMapping,
        deleteMapping,
    };
}
