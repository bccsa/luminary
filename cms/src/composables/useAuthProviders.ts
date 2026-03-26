import { ref, computed, watch, toRaw, onBeforeUnmount } from "vue";
import {
    db,
    DocType,
    type AuthProviderConfigDto,
    type AuthProviderDto,
    type DefaultPermissionsDto,
    useDexieLiveQuery,
    type GroupDto,
    AclPermission,
    verifyAccess,
    hasAnyPermission,
    changeReqErrors,
    ApiLiveQueryAsEditable,
    type ApiSearchQuery,
} from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
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
        ref<ApiSearchQuery>({ types: [DocType.AuthProvider], limit: 100 }),
    );
    const providers = providerQuery.editable;
    const isLoadingProviders = providerQuery.isLoading;
    const providerIsModified = providerQuery.isModified;

    // Auth provider configs — fetched from API via ApiLiveQueryAsEditable
    const configQuery = new ApiLiveQueryAsEditable<AuthProviderConfigDto>(
        ref<ApiSearchQuery>({ types: [DocType.AuthProviderConfig], limit: 100 }),
    );
    const configs = configQuery.editable;

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

    // ID of the provider currently being edited (undefined = creating new)
    const editingProviderId = ref<string | undefined>(undefined);

    const isEditing = computed(() => canEdit.value && !!editingProviderId.value);

    const newProvider = ref<AuthProviderDto>({
        _id: db.uuid(),
        type: DocType.AuthProvider,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        label: "",
        domain: "",
        clientId: "",
        audience: "",
    });

    const newProviderConfig = ref<AuthProviderConfigDto>({
        _id: db.uuid(),
        type: DocType.AuthProviderConfig,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        providerId: newProvider.value._id,
    });

    // Current provider being edited/created (writable computed for v-model binding)
    const currentProvider = computed({
        get: () => {
            if (isEditing.value) {
                return providers.value.find((p) => p._id === editingProviderId.value);
            }
            return newProvider.value;
        },
        set: (value) => {
            if (isEditing.value && value) {
                const idx = providers.value.findIndex((p) => p._id === editingProviderId.value);
                if (idx !== -1) providers.value[idx] = value;
            } else if (!isEditing.value && value) {
                newProvider.value = value;
            }
        },
    });

    // Current config being edited/created (writable computed for v-model binding)
    const currentProviderConfig = computed({
        get: () => {
            if (isEditing.value) {
                return configs.value.find((c) => c.providerId === editingProviderId.value);
            }
            return newProviderConfig.value;
        },
        set: (value) => {
            if (isEditing.value && value) {
                const idx = configs.value.findIndex(
                    (c) => c.providerId === editingProviderId.value,
                );
                if (idx !== -1) configs.value[idx] = value;
            } else if (!isEditing.value && value) {
                newProviderConfig.value = value!;
            }
        },
    });

    // Dirty checking for the modal (is the currently-open provider edited)
    const isDirty = computed(() => {
        if (!isEditing.value) return true; // New provider — always saveable
        if (!editingProviderId.value) return false;
        const config = configs.value.find((c) => c.providerId === editingProviderId.value);
        return (
            providerQuery.isEdited.value(editingProviderId.value) ||
            (config ? configQuery.isEdited.value(config._id) : false)
        );
    });

    // Dirty checking for the route guard (any provider/config has unsaved edits)
    const isDirtyAny = computed(
        () =>
            providers.value.some((p) => providerQuery.isEdited.value(p._id)) ||
            configs.value.some((c) => configQuery.isEdited.value(c._id)),
    );

    // Validation state
    const hasAttemptedSubmit = ref(false);

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

    watch(showModal, (visible) => {
        if (!visible) {
            // Revert unsaved edits to existing providers when modal is dismissed
            if (editingProviderId.value) {
                providerQuery.revert(editingProviderId.value);
                const config = configs.value.find(
                    (c) => c.providerId === editingProviderId.value,
                );
                if (config) configQuery.revert(config._id);
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

    function resetNewProvider() {
        const newId = db.uuid();
        newProvider.value = {
            _id: newId,
            type: DocType.AuthProvider,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            label: "",
            domain: "",
            clientId: "",
            audience: "",
        };
        newProviderConfig.value = {
            _id: db.uuid(),
            type: DocType.AuthProviderConfig,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            providerId: newId,
        };
    }

    function openCreateModal() {
        resetNewProvider();
        editingProviderId.value = undefined;
        openModal();
    }

    function editProvider(provider: AuthProviderDto) {
        editingProviderId.value = provider._id;
        // If no config exists yet for this provider, push a stub into the config editable
        if (!configs.value.find((c) => c.providerId === provider._id)) {
            configQuery.editable.value.push({
                _id: db.uuid(),
                type: DocType.AuthProviderConfig as DocType.AuthProviderConfig,
                updatedTimeUtc: Date.now(),
                memberOf: [...(provider.memberOf ?? [])],
                providerId: provider._id,
            });
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

            // Set deleteReq on provider in the editable array and save via changeRequest
            const providerInEditable = providers.value.find((p) => p._id === providerId);
            if (providerInEditable) {
                providerInEditable.deleteReq = 1;
                await providerQuery.save(providerId);
            }

            // Also delete the associated config doc if it exists
            const configDoc = configs.value.find((c) => c.providerId === providerId);
            if (configDoc) {
                configDoc.deleteReq = 1;
                await configQuery.save(configDoc._id);
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

            if (isEditing.value && editingProviderId.value) {
                const provider = providers.value.find((p) => p._id === editingProviderId.value);
                const config = configs.value.find(
                    (c) => c.providerId === editingProviderId.value,
                );
                if (!provider) return;

                // Sync memberOf from provider → config and update timestamps
                const memberOf = Array.isArray(provider.memberOf)
                    ? Array.from(provider.memberOf)
                    : [];
                provider.updatedTimeUtc = Date.now();
                if (config) {
                    config.memberOf = memberOf;
                    config.updatedTimeUtc = Date.now();
                }

                const label = provider.label ?? "";

                await providerQuery.save(editingProviderId.value);
                if (config) await configQuery.save(config._id);

                closeModal();

                notification.addNotification({
                    title: `Provider ${label} updated`,
                    description: `Your provider has been successfully updated.`,
                    state: "success",
                });
            } else {
                const provider = {
                    ...toRaw(newProvider.value),
                    memberOf: Array.isArray(newProvider.value.memberOf)
                        ? Array.from(newProvider.value.memberOf)
                        : [],
                    updatedTimeUtc: Date.now(),
                };
                const config = {
                    ...toRaw(newProviderConfig.value),
                    memberOf: [...provider.memberOf],
                    updatedTimeUtc: Date.now(),
                };

                // Push to editables so the route guard and isEdited tracking cover them
                providers.value.push(provider);
                configs.value.push(config);

                await providerQuery.save(provider._id);
                await configQuery.save(config._id);

                resetNewProvider();
                closeModal();

                notification.addNotification({
                    title: `Provider ${provider.label} created`,
                    description: `Your provider has been successfully created.`,
                    state: "success",
                });
            }
        } catch (err) {
            console.error("Failed to save provider:", err);
            errors.value = [err instanceof Error ? err.message : "Failed to save provider"];
        } finally {
            isLoading.value = false;
        }
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

        // Provider actions
        openCreateModal,
        editProvider,
        deleteProvider,
        confirmDelete,
        saveProvider,
        closeModal,

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
