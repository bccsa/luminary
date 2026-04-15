import { ref, computed, nextTick, watch, toRaw, onBeforeUnmount } from "vue";
import {
    db,
    DocType,
    type AuthProviderConfigDto,
    type AuthProviderDto,
    type AuthProviderProviderConfig,
    type DefaultPermissionsDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    hasAnyPermission,
    changeReqErrors,
    AckStatus,
    ApiLiveQueryAsEditable,
    type ApiSearchQuery,
} from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import _ from "lodash";

const AUTH_PROVIDER_CONFIG_SINGLETON_ID = "authProviderConfig";

function buildEmptySingleton(): AuthProviderConfigDto {
    return {
        _id: AUTH_PROVIDER_CONFIG_SINGLETON_ID,
        type: DocType.AuthProviderConfig,
        updatedTimeUtc: Date.now(),
        memberOf: ["group-super-admins"],
        providers: {},
    } as AuthProviderConfigDto;
}

export function useAuthProviders() {
    const notification = useNotificationStore();

    // Groups — still synced to Dexie, so use live query
    const groups = useDexieLiveQuery(
        () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
        { initialValue: [] as GroupDto[] },
    );

    // Filter groups to only show those where user has both Edit and Assign permissions
    const availableGroups = computed(() =>
        groups.value.filter(
            (group) =>
                verifyAccess([group._id], DocType.Group, AclPermission.Edit) &&
                verifyAccess([group._id], DocType.Group, AclPermission.Assign),
        ),
    );

    // Auth providers — fetched from API via ApiLiveQueryAsEditable
    const providerQuery = new ApiLiveQueryAsEditable<AuthProviderDto>(
        ref<ApiSearchQuery>({ types: [DocType.AuthProvider] }),
        { filterFn: (item) => ({ ...item }) },
    );
    const providers = providerQuery.editable;
    const isLoadingProviders = providerQuery.isLoading;
    const providerIsModified = providerQuery.isModified;

    // Auth provider config — singleton document fetched from the API. The
    // editable array contains at most one doc (the singleton); per-provider
    // entries live under `providers[configId]`.
    const configQuery = new ApiLiveQueryAsEditable<AuthProviderConfigDto>(
        ref<ApiSearchQuery>({ types: [DocType.AuthProviderConfig] }),
        { filterFn: (item) => ({ ...item }) },
    );
    const configs = configQuery.editable;

    /**
     * The singleton AuthProviderConfig doc — the shared container for every
     * provider's JWT config entry. Exposed to FormModal as a read-only prop so
     * it can look up the current entry for staging. Never mutated outside of
     * saveProvider/confirmDelete.
     */
    const authProviderConfig = computed<AuthProviderConfigDto | undefined>(() =>
        configs.value.find((c) => c._id === AUTH_PROVIDER_CONFIG_SINGLETON_ID),
    );

    /**
     * Returns the editable singleton, seeding an empty one into the editable
     * array if the DB has no AuthProviderConfig doc yet. Only call from mutation
     * paths (save/delete) — reads should use `authProviderConfig` instead.
     */
    function ensureSingleton(): AuthProviderConfigDto {
        let singleton = configs.value.find((c) => c._id === AUTH_PROVIDER_CONFIG_SINGLETON_ID);
        if (!singleton) singleton = configs.value[0];
        if (!singleton) {
            singleton = buildEmptySingleton();
            configs.value.push(singleton);
        }
        if (!singleton.providers) singleton.providers = {};
        return singleton;
    }

    /**
     * Whether a given provider doc has unsaved edits (editable ≠ shadow).
     * FormModal combines this with its own staging-diff to derive isDirty.
     */
    function isProviderEdited(id: string | undefined): boolean {
        if (!id) return false;
        return providerQuery.isEdited.value(id);
    }

    // DefaultPermissions — singleton fetched from the API via ApiLiveQueryAsEditable.
    // Not mirrored into Dexie; edits are committed straight back via the query's save().
    const defaultPermissionsQuery = new ApiLiveQueryAsEditable<DefaultPermissionsDto>(
        ref<ApiSearchQuery>({ types: [DocType.DefaultPermissions] }),
        { filterFn: (item) => ({ ...item }) },
    );
    const defaultPermissionsDocs = defaultPermissionsQuery.editable;
    const defaultPermissions = computed<DefaultPermissionsDto | undefined>(
        () => defaultPermissionsDocs.value[0],
    );

    // Permission computeds
    const canDelete = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Delete));
    const canEdit = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Edit));
    const canEditDefaultPermissions = computed(() =>
        hasAnyPermission(DocType.DefaultPermissions, AclPermission.Edit),
    );

    // ── Provider modal state ────────────────────────────────────────────────

    const isLoading = ref(false);
    const errors = ref<string[] | undefined>(undefined);

    const showModal = ref(false);
    const showDeleteModal = ref(false);
    const providerToDelete = ref<AuthProviderDto | undefined>(undefined);

    // ID of the provider currently being edited or created
    const editingProviderId = ref<string | undefined>(undefined);

    // True when editing an existing provider (not creating a new one)
    const isEditing = computed(() => {
        if (!canEdit.value || !editingProviderId.value) return false;
        // If the provider exists in the live (source) data, it's an edit
        return providerQuery.liveData.value.some((p) => p._id === editingProviderId.value);
    });

    // Current provider — always points at the item in the editable array (like EditGroup.vue).
    // For create, we push into the editable array when the modal opens.
    const currentProvider = computed({
        get: () =>
            editingProviderId.value
                ? providers.value.find((p) => p._id === editingProviderId.value)
                : undefined,
        set: (value) => {
            if (!editingProviderId.value || !value) return;
            const idx = providers.value.findIndex((p) => p._id === editingProviderId.value);
            if (idx !== -1) providers.value[idx] = value;
        },
    });

    /**
     * Dirty state is sourced from FormModal via `v-model:isDirty`. FormModal
     * combines its local staging-diff with the provider's editable≠shadow
     * status (via `isProviderEdited`) and writes the result back here. The
     * route guard + close-without-save handling rely on this ref.
     */
    const isFormDirty = ref(false);

    // Route guard: dirty if the modal is open and has unsaved edits.
    const isDirtyAny = computed(() => showModal.value && isFormDirty.value);

    function openModal() {
        showModal.value = true;
    }

    function closeModal() {
        showModal.value = false;
    }

    function revertProvider() {
        if (!editingProviderId.value) return;
        providerQuery.revert(editingProviderId.value);
        // Staging lives in FormModal — FormModal re-loads it from the singleton
        // after the revert emit, so nothing to reset here.
    }

    // `flush: 'sync'` ensures close-cleanup runs the moment `showModal` flips
    // to false, rather than waiting for the next render cycle. The route guard
    // + ConfirmBeforeLeavingModal read `isDirtyAny` synchronously on navigation,
    // and the composable spec's withSetup harness never renders at all — both
    // rely on the cleanup having already happened by the time they look.
    watch(
        showModal,
        (visible) => {
            if (!visible) {
                // Revert unsaved changes (for both edit and create).
                // For new providers, revert removes them from the editable arrays.
                if (editingProviderId.value && isFormDirty.value) {
                    revertProvider();
                }
                editingProviderId.value = undefined;
                errors.value = undefined;
                isFormDirty.value = false;
            }
        },
        { flush: "sync" },
    );

    watch(changeReqErrors, (errs) => {
        if (errs && errs.length > 0) {
            errs.forEach((error) => {
                notification.addNotification({
                    title: "Failed to save provider",
                    description: error,
                    state: "error",
                });
            });

            if (showModal.value) closeModal();

            changeReqErrors.value = [];
        }
    });

    function openCreateModal() {
        // Push a new provider into the editable array (same pattern as GroupOverview.createGroup).
        // FormModal's staging ref initializes to {} on mount; no seeding needed here.
        const newId = db.uuid();
        const configId = db.uuid();
        const newProvider: AuthProviderDto = {
            _id: newId,
            type: DocType.AuthProvider,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            label: "",
            domain: "",
            clientId: "",
            audience: "",
            configId,
        };
        providers.value.push(newProvider);

        editingProviderId.value = newId;
        openModal();
    }

    function editProvider(provider: AuthProviderDto) {
        // Do NOT mutate the editable provider or seed singleton entries here —
        // createEditable treats any editable≠shadow divergence as "user is
        // editing" and blocks subsequent source→editable sync updates for that
        // item, which causes stale reads and prevents the post-save server
        // round-trip from replacing imageData.uploadData with the processed
        // fileCollections. JWT edits go into FormModal's local staging ref
        // which is committed to the singleton only at save time.
        editingProviderId.value = provider._id;
        openModal();
    }

    function deleteProvider() {
        const provider = currentProvider.value;
        if (provider) {
            providerToDelete.value = toRaw(provider) as AuthProviderDto;
            showDeleteModal.value = true;
        }
    }

    async function confirmDelete() {
        if (!providerToDelete.value) return;

        const canDeleteProvider = verifyAccess(
            providerToDelete.value.memberOf ?? [],
            DocType.AuthProvider,
            AclPermission.Delete,
            "all",
        );
        if (!canDeleteProvider) {
            notification.addNotification({
                title: "Access denied",
                description: "You do not have permission to delete this provider",
                state: "error",
            });
            return;
        }

        try {
            const providerLabel = providerToDelete.value.label;
            const providerId = providerToDelete.value._id;
            const configId = providerToDelete.value.configId;

            // Set deleteReq on provider in the editable array and save via changeRequest.
            // `createEditable` tracks dirty state via deep-watched refs that update on the
            // next microtask, so we must `await nextTick()` before `save()` — otherwise
            // `isEdited` still reports false and `save()` no-ops.
            const providerInEditable = providers.value.find((p) => p._id === providerId);
            if (providerInEditable) {
                providerInEditable.deleteReq = 1;
                await nextTick();
                await providerQuery.save(providerId);
            }

            // Remove this provider's entry from the singleton and save it.
            // Never delete the singleton doc itself — other providers still live there.
            const singleton = configs.value.find(
                (c) => c._id === AUTH_PROVIDER_CONFIG_SINGLETON_ID,
            );
            if (singleton && configId && singleton.providers?.[configId]) {
                delete singleton.providers[configId];
                await configQuery.save(AUTH_PROVIDER_CONFIG_SINGLETON_ID);
            }

            showDeleteModal.value = false;
            providerToDelete.value = undefined;

            if (showModal.value) closeModal();

            notification.addNotification({
                title: `Provider ${providerLabel} deleted`,
                description: `The provider has been successfully deleted.`,
                state: "success",
            });
        } catch (error) {
            console.error("Error deleting provider:", error);
            notification.addNotification({
                title: "Failed to delete provider",
                description: error instanceof Error ? error.message : "An unknown error occurred",
                state: "error",
            });
        }
    }

    /**
     * Persist the current provider and its staged JWT config.
     *
     * `stagingConfig` is passed in from FormModal because staging lives there
     * (see FormModal.vue). We compute the diff against the singleton here —
     * that way FormModal stays unaware of the createEditable sync constraints,
     * and this function stays the single owner of the singleton mutation.
     *
     * FormModal is expected to have already validated the form before emitting
     * save; this function trusts the call and persists whatever it's given.
     */
    async function saveProvider(stagingConfig: AuthProviderProviderConfig) {
        isLoading.value = true;
        errors.value = undefined;

        try {
            const provider = currentProvider.value;
            if (!provider || !editingProviderId.value) return;

            // Stamp a configId on legacy providers that predate the field.
            // Done at save time (not on open) so the editable≠shadow window is
            // narrow — save() calls updateShadow() immediately after success,
            // restoring the sync path.
            if (!provider.configId) {
                provider.configId = db.uuid();
            }

            const label = provider.label ?? "";
            const creating = !isEditing.value;

            // Save provider doc if edited (always on create).
            if (creating || providerQuery.isEdited.value(editingProviderId.value)) {
                const providerRes = await providerQuery.save(editingProviderId.value);
                if (providerRes?.ack === AckStatus.Rejected) {
                    errors.value = [
                        providerRes.message ||
                            (creating ? "Failed to create provider" : "Failed to save provider"),
                    ];
                    return;
                }
            }

            // Commit staged JWT config into the singleton and save it, but
            // only if the staged entry actually differs from what's already
            // in the singleton for this provider. This keeps opens with no
            // JWT edits from touching (and therefore blocking sync on) the
            // singleton.
            if (provider.configId) {
                const singleton = ensureSingleton();
                const currentEntry = singleton.providers?.[provider.configId];
                if (!_.isEqual(stagingConfig, currentEntry ?? {})) {
                    singleton.providers[provider.configId] = _.cloneDeep(stagingConfig);
                    const configRes = await configQuery.save(
                        AUTH_PROVIDER_CONFIG_SINGLETON_ID,
                    );
                    if (configRes?.ack === AckStatus.Rejected) {
                        errors.value = [
                            configRes.message || "Failed to save provider config",
                        ];
                        return;
                    }
                }
            }

            editingProviderId.value = undefined;
            closeModal();
            notification.addNotification({
                title: creating ? `Provider ${label} created` : `Provider ${label} updated`,
                description: creating
                    ? `Your provider has been successfully created.`
                    : `Your provider has been successfully updated.`,
                state: "success",
            });
        } catch (err) {
            console.error("Failed to save provider:", err);
            errors.value = [err instanceof Error ? err.message : "Failed to save provider"];
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Clone the current provider into a new editable and switch the modal to
     * edit it. The carry-over of the user's in-progress JWT staging happens
     * inside FormModal via its `prepareForDuplicate()` handoff — the parent
     * view is expected to call that *before* invoking `duplicateProvider` so
     * the staging watcher skips its reload on the id flip.
     */
    function duplicateProvider() {
        const provider = currentProvider.value;
        if (!provider) return;

        const newId = db.uuid();
        const newConfigId = db.uuid();

        const clonedProvider = _.cloneDeep(toRaw(provider)) as AuthProviderDto;
        clonedProvider._id = newId;
        clonedProvider.configId = newConfigId;
        delete (clonedProvider as any)._rev;
        clonedProvider.label = (clonedProvider.label ?? "") + " (Copy)";
        if (clonedProvider.imageData?.fileCollections) {
            clonedProvider.imageData.fileCollections = [];
        }

        providers.value.push(clonedProvider);
        editingProviderId.value = newId;

        notification.addNotification({
            title: "Provider duplicated",
            description: "Edit the copy and save when ready.",
            state: "success",
        });
    }

    // ── Default Groups state ────────────────────────────────────────────────

    const editableDefaultGroups = ref<string[]>([]);
    watch(
        defaultPermissions,
        (cfg) => {
            if (cfg) editableDefaultGroups.value = [...(cfg.defaultGroups ?? [])];
        },
        { immediate: true },
    );

    const isDefaultGroupsDirty = computed(
        () =>
            !_.isEqual(
                [...editableDefaultGroups.value].sort(),
                [...(defaultPermissions.value?.defaultGroups ?? [])].sort(),
            ),
    );

    const defaultGroupOptions = computed(() =>
        groups.value
            .filter(
                (g) =>
                    verifyAccess([g._id], DocType.Group, AclPermission.Edit) &&
                    verifyAccess([g._id], DocType.Group, AclPermission.Assign),
            )
            .map((g) => ({ id: g._id, label: g.name, value: g._id })),
    );

    const defaultGroupSelectedLabels = computed(() =>
        editableDefaultGroups.value.map((groupId) => {
            const group = groups.value.find((g) => g._id === groupId);
            const canAssign =
                !!group &&
                verifyAccess([group._id], DocType.Group, AclPermission.Assign) &&
                verifyAccess([group._id], DocType.Group, AclPermission.Edit);
            return {
                id: groupId,
                label: group?.name ?? groupId,
                value: groupId,
                isVisible: !!group,
                isRemovable: canAssign,
            };
        }),
    );

    const showDefaultGroupsDialog = ref(false);
    const isSavingDefaultGroups = ref(false);

    function openDefaultGroupsDialog() {
        editableDefaultGroups.value = [...(defaultPermissions.value?.defaultGroups ?? [])];
        showDefaultGroupsDialog.value = true;
    }

    async function saveDefaultGroups() {
        const target = defaultPermissionsDocs.value[0];
        if (!target) return;
        isSavingDefaultGroups.value = true;
        try {
            target.defaultGroups = [...editableDefaultGroups.value];
            target.updatedTimeUtc = Date.now();
            // createEditable tracks dirty state on the next microtask, so we
            // must await a tick before save() or it no-ops. Same pattern as
            // confirmDelete above.
            await nextTick();
            const res = await defaultPermissionsQuery.save(target._id);
            if (res?.ack === AckStatus.Rejected) {
                notification.addNotification({
                    title: "Failed to save default groups",
                    description: res.message || "The server rejected the update.",
                    state: "error",
                });
                return;
            }
            showDefaultGroupsDialog.value = false;
            notification.addNotification({
                title: "Default groups saved",
                description: "The default groups have been successfully updated.",
                state: "success",
            });
        } catch (err) {
            notification.addNotification({
                title: "Failed to save default groups",
                description: err instanceof Error ? err.message : "An unknown error occurred",
                state: "error",
            });
        } finally {
            isSavingDefaultGroups.value = false;
        }
    }

    // Cleanup live queries when the composable's owner component unmounts
    onBeforeUnmount(() => {
        providerQuery.stopLiveQuery();
        configQuery.stopLiveQuery();
        defaultPermissionsQuery.stopLiveQuery();
    });

    return {
        // Data
        groups,
        availableGroups,
        providers,
        authProviderConfig,
        isLoadingProviders,
        defaultPermissions,

        // Permissions
        canDelete,
        canEdit,
        canEditDefaultPermissions,

        // Provider modal state
        showModal,
        showDeleteModal,
        providerToDelete,
        editingProviderId,
        isEditing,
        currentProvider,
        isLoading,
        errors,
        isFormDirty,
        isDirtyAny,
        providerIsModified,
        isProviderEdited,

        // Provider actions
        openCreateModal,
        editProvider,
        deleteProvider,
        confirmDelete,
        saveProvider,
        duplicateProvider,
        closeModal,
        revertProvider,

        // Default groups state
        editableDefaultGroups,
        isDefaultGroupsDirty,
        defaultGroupOptions,
        defaultGroupSelectedLabels,
        showDefaultGroupsDialog,
        isSavingDefaultGroups,

        // Default groups actions
        openDefaultGroupsDialog,
        saveDefaultGroups,
    };
}
