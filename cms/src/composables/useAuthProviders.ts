import { ref, computed, nextTick, watch, toRaw } from "vue";
import {
    db,
    DocType,
    type AuthProviderDto,
    useSharedHybridQuery,
    toEditable,
    queryLocal,
    type GroupDto,
    AclPermission,
    verifyAccess,
    hasAnyPermission,
    changeReqErrors,
    AckStatus,
} from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { assignableGroups } from "@/util/groups";

export function useAuthProviders() {
    const notification = useNotificationStore();

    const groups = useSharedHybridQuery<GroupDto>(() => ({ selector: { type: DocType.Group } }), {
        live: true,
    });
    const availableGroups = computed(() => assignableGroups(groups.value));

    const providersSource = useSharedHybridQuery<AuthProviderDto>(
        () => ({ selector: { type: DocType.AuthProvider } }),
        { live: true, persistOffline: true },
    );
    const providerEditable = toEditable<AuthProviderDto>(providersSource, {
        persistOffline: true,
        filterFn: (item) => ({ ...item }),
    });

    const { duplicate, remove, save } = providerEditable;
    const providers = providerEditable.editable;
    const providerIsModified = providerEditable.isModified;

    const isLoadingProviders = ref(true);
    queryLocal<AuthProviderDto>({ selector: { type: DocType.AuthProvider } }).finally(() => {
        isLoadingProviders.value = false;
    });

    const canDelete = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Delete));
    const canEdit = computed(() => hasAnyPermission(DocType.AuthProvider, AclPermission.Edit));

    // ── Provider modal state ────────────────────────────────────────────────

    const isLoading = ref(false);
    const errors = ref<string[] | undefined>(undefined);

    const showModal = ref(false);
    const showDeleteModal = ref(false);
    const providerToDelete = ref<AuthProviderDto | undefined>(undefined);

    const editingProviderId = ref<string | undefined>(undefined);

    const isEditing = computed(() => {
        if (!canEdit.value || !editingProviderId.value) return false;
        return providersSource.value.some((p) => p._id === editingProviderId.value);
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
        return providerEditable.isEdited.value(id);
    }

    function openModal() {
        showModal.value = true;
    }

    function closeModal() {
        showModal.value = false;
    }

    function revertProvider() {
        if (!editingProviderId.value) return;
        providerEditable.revert(editingProviderId.value);
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
            displayName: "",
            label: "",
            domain: "",
            clientId: "",
            audience: "",
            sortIndex: 1,
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
            const providerLabel =
                providerToDelete.value.displayName || providerToDelete.value.label;
            const providerId = providerToDelete.value._id;

            await remove(providerId);

            await save(providerId);

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

            // Let toEditable's dirty-tracking watchers flush so isEdited (used here and inside
            // save()) reflects edits made in the same tick — e.g. a just-created provider whose
            // fields were set synchronously before saving. Mirrors confirmDelete's nextTick.
            await nextTick();

            const label = provider.displayName || provider.label || provider._id;
            const creating = !isEditing.value;

            if (creating || providerEditable.isEdited.value(editingProviderId.value)) {
                const providerRes = await providerEditable.save(editingProviderId.value);
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

        const clonedProvider = duplicate(provider._id, (clone) => {
            clone.label = (clone.label ?? "") + " (copy)";

            if (clone.imageData?.fileCollections) {
                clone.imageData.fileCollections = [];
            }
            return clone;
        });

        if (!clonedProvider) return;
        editingProviderId.value = clonedProvider._id;

        notification.addNotification({
            title: "Provider duplicated",
            description: "Edit the copy and save when ready.",
            state: "success",
        });
    }

    return {
        groups,
        availableGroups,
        providers,
        isLoadingProviders,

        canDelete,
        canEdit,

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
    };
}
