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

    // ── Local editing copies ─────────────────────────────────────────────────
    // Detached from providers.value / configs.value so field edits only
    // invalidate the local refs, not the entire reactive arrays.
    // providers.value is only written to on save.
    const editingProviderLocal = ref<AuthProviderDto | undefined>(undefined);
    const editingConfigLocal = ref<AuthProviderConfigDto | undefined>(undefined);
    // Snapshots taken at modal-open time, used for revert
    const editingProviderSnapshot = ref<AuthProviderDto | undefined>(undefined);
    const editingConfigSnapshot = ref<AuthProviderConfigDto | undefined>(undefined);

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

    // Current provider being edited/created (writable computed for v-model binding).
    // When editing, reads/writes the local detached copy so mutations don't touch providers.value.
    const currentProvider = computed({
        get: () => {
            if (isEditing.value) return editingProviderLocal.value;
            return newProvider.value;
        },
        set: (value) => {
            if (isEditing.value) {
                editingProviderLocal.value = value;
            } else if (value) {
                newProvider.value = value;
            }
        },
    });

    // Current config being edited/created (writable computed for v-model binding).
    const currentProviderConfig = computed({
        get: () => {
            if (isEditing.value) return editingConfigLocal.value;
            return newProviderConfig.value;
        },
        set: (value) => {
            if (isEditing.value) {
                editingConfigLocal.value = value;
            } else if (value) {
                newProviderConfig.value = value!;
            }
        },
    });

    // ── Dirty tracking ───────────────────────────────────────────────────────
    // isDirty is a plain ref updated by a deep watcher whose callback is cheap
    // (just a flag set + a debounced setTimeout). _.isEqual runs at most once,
    // 500 ms after the user stops making changes, to handle the case where they
    // type something and then manually revert it back to the original value.
    const isDirty = ref(false);
    let stopChangeWatcher: (() => void) | undefined;
    let accuracyTimer: ReturnType<typeof setTimeout> | undefined;

    function startDirtyTracking() {
        isDirty.value = false;
        clearTimeout(accuracyTimer);
        stopChangeWatcher?.();

        stopChangeWatcher = watch(
            [currentProvider, currentProviderConfig],
            () => {
                // Immediate feedback — no expensive work here
                isDirty.value = true;

                // After the user pauses, check if they've typed back to the original value.
                // Only meaningful when editing an existing provider (snapshots exist).
                if (isEditing.value) {
                    clearTimeout(accuracyTimer);
                    accuracyTimer = setTimeout(() => {
                        const isActuallyDirty =
                            !_.isEqual(
                                toRaw(editingProviderLocal.value),
                                toRaw(editingProviderSnapshot.value),
                            ) ||
                            !_.isEqual(
                                toRaw(editingConfigLocal.value),
                                toRaw(editingConfigSnapshot.value),
                            );
                        isDirty.value = isActuallyDirty;
                    }, 500);
                }
            },
            { deep: true },
        );
    }

    // Route guard: dirty if the modal is open and has unsaved edits.
    // Does not depend on providers.value, so it never cascades on field edits.
    const isDirtyAny = computed(() => showModal.value && isDirty.value);

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
        startDirtyTracking();
    }

    function closeModal() {
        showModal.value = false;
    }

    function revertProvider() {
        if (!editingProviderId.value) return;
        // Reset local copies to their snapshots
        editingProviderLocal.value = editingProviderSnapshot.value
            ? _.cloneDeep(toRaw(editingProviderSnapshot.value))
            : undefined;
        editingConfigLocal.value = editingConfigSnapshot.value
            ? _.cloneDeep(toRaw(editingConfigSnapshot.value))
            : undefined;
        // Restart dirty tracking so the next change marks dirty again
        startDirtyTracking();
    }

    watch(showModal, (visible) => {
        if (!visible) {
            stopChangeWatcher?.();
            stopChangeWatcher = undefined;
            clearTimeout(accuracyTimer);
            isDirty.value = false;
            editingProviderId.value = undefined;
            editingProviderLocal.value = undefined;
            editingConfigLocal.value = undefined;
            editingProviderSnapshot.value = undefined;
            editingConfigSnapshot.value = undefined;
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

        // Ensure a config stub exists in the editable array
        if (!configs.value.find((c) => c.providerId === provider._id)) {
            configQuery.editable.value.push({
                _id: db.uuid(),
                type: DocType.AuthProviderConfig as DocType.AuthProviderConfig,
                updatedTimeUtc: Date.now(),
                memberOf: [...(provider.memberOf ?? [])],
                providerId: provider._id,
            });
        }

        // Deep-clone into local refs so editing is fully detached from providers.value
        const rawProvider = _.cloneDeep(toRaw(provider));
        editingProviderLocal.value = rawProvider;
        editingProviderSnapshot.value = _.cloneDeep(rawProvider);

        const config = configs.value.find((c) => c.providerId === provider._id);
        const rawConfig = config ? _.cloneDeep(toRaw(config)) : undefined;
        editingConfigLocal.value = rawConfig;
        editingConfigSnapshot.value = rawConfig ? _.cloneDeep(rawConfig) : undefined;

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
                const localProvider = editingProviderLocal.value;
                const localConfig = editingConfigLocal.value;
                if (!localProvider) return;

                const memberOf = Array.isArray(localProvider.memberOf)
                    ? Array.from(localProvider.memberOf)
                    : [];

                // Write the local copy back into providers.value so providerQuery.save() picks it up
                const providerIdx = providers.value.findIndex(
                    (p) => p._id === editingProviderId.value,
                );
                if (providerIdx !== -1) {
                    providers.value[providerIdx] = {
                        ...toRaw(localProvider),
                        memberOf,
                        updatedTimeUtc: Date.now(),
                    };
                }

                if (localConfig) {
                    const configIdx = configs.value.findIndex(
                        (c) => c.providerId === editingProviderId.value,
                    );
                    if (configIdx !== -1) {
                        configs.value[configIdx] = {
                            ...toRaw(localConfig),
                            memberOf,
                            updatedTimeUtc: Date.now(),
                        };
                    }
                }

                const label = localProvider.label ?? "";

                await providerQuery.save(editingProviderId.value);
                const savedConfig = configs.value.find(
                    (c) => c.providerId === editingProviderId.value,
                );
                if (savedConfig) await configQuery.save(savedConfig._id);

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

                // Push to editables so isEdited tracking covers them
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
        stopChangeWatcher?.();
        clearTimeout(accuracyTimer);
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
