import { ref, computed, watch, toRaw, onBeforeUnmount } from "vue";
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
import { useNotificationStore } from "@/stores/notification";
import { validate, type Validation } from "@/components/content/ContentValidator";
import _ from "lodash";

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
     * Returns the editable singleton, seeding an empty one into the editable
     * array if the DB has no AuthProviderConfig doc yet.
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

    // DefaultPermissions — still synced to Dexie
    const defaultPermissions = useDexieLiveQuery(
        () =>
            db.docs.where({ type: DocType.DefaultPermissions }).first() as unknown as Promise<
                DefaultPermissionsDto | undefined
            >,
        { initialValue: undefined as DefaultPermissionsDto | undefined },
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

    // Current config — the per-provider entry inside the singleton's providers map.
    // Writing via this computed mutates `singleton.providers[provider.configId]`
    // so the existing dirty tracking on the singleton doc picks it up.
    const currentProviderConfig = computed<AuthProviderProviderConfig | undefined>({
        get: () => {
            const provider = currentProvider.value;
            if (!provider?.configId) return undefined;
            const singleton = configs.value.find(
                (c) => c._id === AUTH_PROVIDER_CONFIG_SINGLETON_ID,
            );
            return singleton?.providers?.[provider.configId];
        },
        set: (value) => {
            const provider = currentProvider.value;
            if (!provider?.configId || !value) return;
            const singleton = ensureSingleton();
            singleton.providers[provider.configId] = value;
        },
    });

    // ── Dirty tracking ───────────────────────────────────────────────────────
    // Uses isEdited from the query instances (same pattern as EditGroup.vue).
    // For new providers, dirty as soon as anything non-empty is typed.
    const isDirty = computed(() => {
        if (!editingProviderId.value) return false;
        return (
            providerQuery.isEdited.value(editingProviderId.value) ||
            configQuery.isEdited.value(AUTH_PROVIDER_CONFIG_SINGLETON_ID)
        );
    });

    // Route guard: dirty if the modal is open and has unsaved edits.
    const isDirtyAny = computed(() => showModal.value && isDirty.value);

    // Validation state
    const hasAttemptedSubmit = ref(false);

    // Field-level validation
    const providerValidations = ref<Validation[]>([]);

    watch(
        [currentProvider, hasAttemptedSubmit],
        ([provider, attempted]) => {
            if (!provider || !attempted) return;
            validate("Label is required", "label", providerValidations.value, provider, (p) => !!(p.label ?? "").trim());
            validate("Domain is required", "domain", providerValidations.value, provider, (p) => !!(p.domain ?? "").trim());
            validate("Client ID is required", "clientId", providerValidations.value, provider, (p) => !!(p.clientId ?? "").trim());
            validate("Audience is required", "audience", providerValidations.value, provider, (p) => !!(p.audience ?? "").trim());
        },
        { deep: true },
    );

    const hasValidCredentials = computed(() => {
        const p = currentProvider.value;
        if (!p) return false;
        return Boolean(
            (p.domain || "").trim() && (p.clientId || "").trim() && (p.audience || "").trim(),
        );
    });

    const isFormValid = computed(() => {
        const provider = currentProvider.value;
        if (!provider) return false;
        if (!(provider.label ?? "").trim()) return false;
        if (!hasValidCredentials.value) return false;
        return true;
    });

    function openModal() {
        hasAttemptedSubmit.value = false;
        showModal.value = true;
    }

    function closeModal() {
        showModal.value = false;
    }

    function revertProvider() {
        if (!editingProviderId.value) return;
        providerQuery.revert(editingProviderId.value);
        configQuery.revert(AUTH_PROVIDER_CONFIG_SINGLETON_ID);
    }

    watch(showModal, (visible) => {
        if (!visible) {
            // Revert unsaved changes (for both edit and create).
            // For new providers, revert removes them from the editable arrays.
            if (editingProviderId.value && isDirty.value) {
                revertProvider();
            }
            editingProviderId.value = undefined;
            errors.value = undefined;
            hasAttemptedSubmit.value = false;
        }
    });

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
        // Push a new provider into the editable array (same pattern as GroupOverview.createGroup)
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

        // Seed an empty entry on the singleton so the modal can bind to it.
        const singleton = ensureSingleton();
        singleton.providers[configId] = {};

        editingProviderId.value = newId;
        openModal();
    }

    function editProvider(provider: AuthProviderDto) {
        // Stale dev data may have providers without a configId. Stamp one now so
        // the save flow persists it on the provider doc.
        if (!provider.configId) {
            const providerInEditable = providers.value.find((p) => p._id === provider._id);
            if (providerInEditable) providerInEditable.configId = db.uuid();
        }

        const editableProvider =
            providers.value.find((p) => p._id === provider._id) ?? provider;
        editingProviderId.value = editableProvider._id;

        // Ensure the singleton has an entry for this provider's configId.
        const singleton = ensureSingleton();
        if (editableProvider.configId && !singleton.providers[editableProvider.configId]) {
            singleton.providers[editableProvider.configId] = {};
        }

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

            // Set deleteReq on provider in the editable array and save via changeRequest
            const providerInEditable = providers.value.find((p) => p._id === providerId);
            if (providerInEditable) {
                providerInEditable.deleteReq = 1;
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

    async function saveProvider() {
        isLoading.value = true;
        errors.value = undefined;
        hasAttemptedSubmit.value = true;

        try {
            if (!isFormValid.value) {
                errors.value = ["Please fill in all required fields"];
                return;
            }

            const provider = currentProvider.value;
            if (!provider || !editingProviderId.value) return;

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

            // Save the singleton if any provider's entry was edited this session.
            if (configQuery.isEdited.value(AUTH_PROVIDER_CONFIG_SINGLETON_ID)) {
                const configRes = await configQuery.save(AUTH_PROVIDER_CONFIG_SINGLETON_ID);
                if (configRes?.ack === AckStatus.Rejected) {
                    errors.value = [configRes.message || "Failed to save provider config"];
                    return;
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

        // Copy the source entry (if any) into a fresh key on the singleton.
        const singleton = ensureSingleton();
        const sourceEntry = provider.configId
            ? singleton.providers[provider.configId]
            : undefined;
        singleton.providers[newConfigId] = sourceEntry
            ? _.cloneDeep(toRaw(sourceEntry))
            : {};

        providers.value.push(clonedProvider);
        editingProviderId.value = newId;
        hasAttemptedSubmit.value = false;

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
        if (!defaultPermissions.value) return;
        isSavingDefaultGroups.value = true;
        try {
            const doc = {
                ...toRaw(defaultPermissions.value),
                defaultGroups: [...editableDefaultGroups.value],
                updatedTimeUtc: Date.now(),
            };
            await db.upsert({ doc });
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
    });

    return {
        // Data
        groups,
        availableGroups,
        providers,
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
        currentProviderConfig,
        isLoading,
        errors,
        isDirty,
        isDirtyAny,
        providerIsModified,
        hasAttemptedSubmit,
        isFormValid,
        providerValidations,

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
