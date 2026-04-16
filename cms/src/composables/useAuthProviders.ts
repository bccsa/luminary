import { ref, computed, nextTick, watch, toRaw, onBeforeUnmount } from "vue";
import {
    db,
    DocType,
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
import _ from "lodash";

export function useAuthProviders() {
    const notification = useNotificationStore();

    const groups = useDexieLiveQuery(
        () => db.docs.where({ type: "group" }).toArray() as unknown as Promise<GroupDto[]>,
        { initialValue: [] as GroupDto[] },
    );

    const availableGroups = computed(() =>
        groups.value.filter(
            (group) =>
                verifyAccess([group._id], DocType.Group, AclPermission.Edit) &&
                verifyAccess([group._id], DocType.Group, AclPermission.Assign),
        ),
    );

    const providerQuery = new ApiLiveQueryAsEditable<AuthProviderDto>(
        ref<ApiSearchQuery>({ types: [DocType.AuthProvider] }),
        { filterFn: (item) => ({ ...item }) },
    );
    const providers = providerQuery.editable;
    const isLoadingProviders = providerQuery.isLoading;
    const providerIsModified = providerQuery.isModified;

    const defaultPermissionsQuery = new ApiLiveQueryAsEditable<DefaultPermissionsDto>(
        ref<ApiSearchQuery>({ types: [DocType.DefaultPermissions] }),
        { filterFn: (item) => ({ ...item }) },
    );
    const defaultPermissionsDocs = defaultPermissionsQuery.editable;
    const defaultPermissions = computed<DefaultPermissionsDto | undefined>(
        () => defaultPermissionsDocs.value[0],
    );

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

    const editingProviderId = ref<string | undefined>(undefined);

    const isEditing = computed(() => {
        if (!canEdit.value || !editingProviderId.value) return false;
        return providerQuery.liveData.value.some((p) => p._id === editingProviderId.value);
    });

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

    const isFormDirty = ref(false);
    const isDirtyAny = computed(() => showModal.value && isFormDirty.value);

    function isProviderEdited(id: string | undefined): boolean {
        if (!id) return false;
        return providerQuery.isEdited.value(id);
    }

    function openModal() {
        showModal.value = true;
    }

    function closeModal() {
        showModal.value = false;
    }

    function revertProvider() {
        if (!editingProviderId.value) return;
        providerQuery.revert(editingProviderId.value);
    }

    watch(
        showModal,
        (visible) => {
            if (!visible) {
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
        providers.value.push(newProvider);

        editingProviderId.value = newId;
        openModal();
    }

    function editProvider(provider: AuthProviderDto) {
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

            const providerInEditable = providers.value.find((p) => p._id === providerId);
            if (providerInEditable) {
                providerInEditable.deleteReq = 1;
                await nextTick();
                await providerQuery.save(providerId);
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

        try {
            const provider = currentProvider.value;
            if (!provider || !editingProviderId.value) return;

            const label = provider.label ?? "";
            const creating = !isEditing.value;

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

        const clonedProvider = _.cloneDeep(toRaw(provider)) as AuthProviderDto;
        clonedProvider._id = newId;
        delete clonedProvider._rev;
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

    onBeforeUnmount(() => {
        providerQuery.stopLiveQuery();
        defaultPermissionsQuery.stopLiveQuery();
    });

    return {
        groups,
        availableGroups,
        providers,
        isLoadingProviders,
        defaultPermissions,

        canDelete,
        canEdit,
        canEditDefaultPermissions,

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

        openCreateModal,
        editProvider,
        deleteProvider,
        confirmDelete,
        saveProvider,
        duplicateProvider,
        closeModal,
        revertProvider,

        editableDefaultGroups,
        isDefaultGroupsDirty,
        defaultGroupOptions,
        defaultGroupSelectedLabels,
        showDefaultGroupsDialog,
        isSavingDefaultGroups,

        openDefaultGroupsDialog,
        saveDefaultGroups,
    };
}
