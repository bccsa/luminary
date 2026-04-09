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
    AckStatus,
    ApiLiveQueryAsEditable,
    type ApiSearchQuery,
} from "luminary-shared";
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
        ref<ApiSearchQuery>({ types: [DocType.AuthProvider], limit: 100 }),
        { filterFn: (item) => ({ ...item }) },
    );
    const providers = providerQuery.editable;
    const isLoadingProviders = providerQuery.isLoading;
    const providerIsModified = providerQuery.isModified;

    // Auth provider configs — fetched from API via ApiLiveQueryAsEditable
    const configQuery = new ApiLiveQueryAsEditable<AuthProviderConfigDto>(
        ref<ApiSearchQuery>({ types: [DocType.AuthProviderConfig], limit: 100 }),
        { filterFn: (item) => ({ ...item }) },
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

    // Current config — always points at the item in the editable array.
    const currentProviderConfig = computed({
        get: () =>
            editingProviderId.value
                ? configs.value.find((c) => c.providerId === editingProviderId.value)
                : undefined,
        set: (value) => {
            if (!editingProviderId.value || !value) return;
            const idx = configs.value.findIndex(
                (c) => c.providerId === editingProviderId.value,
            );
            if (idx !== -1) configs.value[idx] = value;
        },
    });

    // ── Dirty tracking ───────────────────────────────────────────────────────
    // Uses isEdited from the query instances (same pattern as EditGroup.vue).
    // For new providers, dirty as soon as anything non-empty is typed.
    const isDirty = computed(() => {
        if (!editingProviderId.value) return false;
        const configId = configs.value.find(
            (c) => c.providerId === editingProviderId.value,
        )?._id;
        return (
            providerQuery.isEdited.value(editingProviderId.value) ||
            (configId ? configQuery.isEdited.value(configId) : false)
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
        const configDoc = configs.value.find((c) => c.providerId === editingProviderId.value);
        if (configDoc) configQuery.revert(configDoc._id);
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
        // Push new empty docs into the editable arrays (same pattern as GroupOverview.createGroup)
        const newId = db.uuid();
        const newProvider: AuthProviderDto = {
            _id: newId,
            type: DocType.AuthProvider,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            label: "",
            domain: "",
            clientId: "",
            audience: "",
        };
        const newConfig: AuthProviderConfigDto = {
            _id: db.uuid(),
            type: DocType.AuthProviderConfig,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            providerId: newId,
        };

        providers.value.push(newProvider);
        configs.value.push(newConfig);

        editingProviderId.value = newId;
        openModal();
    }

    function editProvider(provider: AuthProviderDto) {
        editingProviderId.value = provider._id;

        // Ensure a config stub exists in the editable array
        if (!configs.value.find((c) => c.providerId === provider._id)) {
            configs.value.push({
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
                // Sync memberOf from provider to config
                const provider = currentProvider.value;
                const config = currentProviderConfig.value;
                if (!provider) return;

                if (config) {
                    config.memberOf = Array.isArray(provider.memberOf)
                        ? [...provider.memberOf]
                        : [];
                }

                const label = provider.label ?? "";

                // Only save docs that were actually edited
                if (providerQuery.isEdited.value(editingProviderId.value)) {
                    const providerRes = await providerQuery.save(editingProviderId.value);
                    if (providerRes?.ack === AckStatus.Rejected) {
                        errors.value = [providerRes.message || "Failed to save provider"];
                        return;
                    }
                }

                if (config && configQuery.isEdited.value(config._id)) {
                    const configRes = await configQuery.save(config._id);
                    if (configRes?.ack === AckStatus.Rejected) {
                        errors.value = [configRes.message || "Failed to save provider config"];
                        return;
                    }
                }

                editingProviderId.value = undefined;
                closeModal();
                notification.addNotification({
                    title: `Provider ${label} updated`,
                    description: `Your provider has been successfully updated.`,
                    state: "success",
                });
            } else {
                // Create: items are already in the editable arrays (pushed in openCreateModal)
                const provider = currentProvider.value;
                const config = currentProviderConfig.value;
                if (!provider) return;

                // Sync memberOf from provider to config
                if (config) {
                    config.memberOf = Array.isArray(provider.memberOf)
                        ? [...provider.memberOf]
                        : [];
                }

                const label = provider.label ?? "";

                const providerRes = await providerQuery.save(provider._id);
                if (providerRes?.ack === AckStatus.Rejected) {
                    errors.value = [providerRes.message || "Failed to create provider"];
                    return;
                }

                if (config) {
                    const configRes = await configQuery.save(config._id);
                    if (configRes?.ack === AckStatus.Rejected) {
                        errors.value = [configRes.message || "Failed to save provider config"];
                        return;
                    }
                }

                editingProviderId.value = undefined;
                closeModal();
                notification.addNotification({
                    title: `Provider ${label} created`,
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

    function duplicateProvider() {
        const provider = currentProvider.value;
        const config = currentProviderConfig.value;
        if (!provider) return;

        const newId = db.uuid();

        const clonedProvider = _.cloneDeep(toRaw(provider)) as AuthProviderDto;
        clonedProvider._id = newId;
        delete (clonedProvider as any)._rev;
        clonedProvider.label = (clonedProvider.label ?? "") + " (Copy)";
        if (clonedProvider.imageData?.fileCollections) {
            clonedProvider.imageData.fileCollections = [];
        }

        const clonedConfig: AuthProviderConfigDto = config
            ? {
                  ..._.cloneDeep(toRaw(config)),
                  _id: db.uuid(),
                  providerId: newId,
              }
            : {
                  _id: db.uuid(),
                  type: DocType.AuthProviderConfig as DocType.AuthProviderConfig,
                  updatedTimeUtc: Date.now(),
                  memberOf: [...(clonedProvider.memberOf ?? [])],
                  providerId: newId,
              };
        delete (clonedConfig as any)._rev;

        providers.value.push(clonedProvider);
        configs.value.push(clonedConfig);
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
