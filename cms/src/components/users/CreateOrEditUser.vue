<script setup lang="ts">
import LBadge from "../common/LBadge.vue";
import LButton from "../button/LButton.vue";
import LCard from "../common/LCard.vue";
import LInput from "../forms/LInput.vue";
import {
    AclPermission,
    AckStatus,
    DocType,
    isConnected,
    hasAnyPermission,
    verifyAccess,
    type AuthProviderDto,
    type UserDto,
    type Uuid,
    useSharedHybridQuery,
    useHybridQueryWithState,
    type GroupDto,
    toEditable,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { useNotificationStore } from "@/stores/notification";
import { ArrowUturnLeftIcon, TrashIcon } from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import LCombobox from "../forms/LCombobox.vue";
import LSelect from "../forms/LSelect.vue";

type Props = {
    id: Uuid;
    isVisible: boolean;
    /** Create mode: skip fetching a non-existent user id from the API. */
    isCreate?: boolean;
};
const props = withDefaults(defineProps<Props>(), { isCreate: false });

const emit = defineEmits(["close"]);

// User is a non-synced type → HybridQuery serves it API-only (REST + on-demand socket rooms).
// Auto-disposes on unmount. Create mode uses a provably-empty selector (same as redirect create).
const { output: liveUsers, isFetching: isLoadingUser } = useHybridQueryWithState<UserDto>(
    () =>
        props.isCreate
            ? { selector: { _id: { $in: [] } } }
            : { selector: { type: DocType.User, _id: props.id } },
    { live: true },
);

const isLoading = computed(() => !props.isCreate && isLoadingUser.value);

const { addNotification } = useNotificationStore();

const showDeleteModal = ref(false);

const currentId = ref<Uuid>(props.id);

function createTemplate(id: Uuid): UserDto {
    return {
        _id: id,
        type: DocType.User,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        email: "",
        name: "New user",
    };
}

const userSource = ref<UserDto[]>([]);

watch(
    liveUsers,
    () => {
        if (liveUsers.value?.length) userSource.value = liveUsers.value;
    },
    { immediate: true },
);

const userEditable = toEditable<UserDto>(userSource);

function hydrateFromUser(user: UserDto) {
    currentId.value = user._id;
    userSource.value = [user];
    userEditable.editable.value.splice(0, userEditable.editable.value.length, { ...user });
    userEditable.updateShadow(user._id);
}

function seedCreateTemplate() {
    userEditable.editable.value.splice(
        0,
        userEditable.editable.value.length,
        createTemplate(currentId.value),
    );
}

const editable = computed<UserDto>({
    get: () => userEditable.editable.value[0],
    set: (val) => {
        const arr = userEditable.editable.value;
        if (arr.length === 0) arr.push(val);
        else arr.splice(0, 1, val);
    },
});

function syncFromApi() {
    if (props.isCreate) return;
    if (isLoadingUser.value) return;
    if (liveUsers.value?.length) {
        hydrateFromUser(liveUsers.value[0]);
    } else {
        userSource.value = [];
        seedCreateTemplate();
    }
}

watch(
    () => props.id,
    (id) => {
        currentId.value = id;
        if (props.isCreate) seedCreateTemplate();
    },
);

watch([liveUsers, isLoadingUser], syncFromApi, { immediate: !props.isCreate });

if (props.isCreate) {
    currentId.value = props.id;
    seedCreateTemplate();
}

const isNew = computed(() => props.isCreate || userSource.value.length === 0);

const isDirty = computed(() => {
    const doc = editable.value;
    if (!doc) return false;
    return userEditable.isEdited.value(doc._id);
});

const groups = useSharedHybridQuery<GroupDto>(() => ({ selector: { type: DocType.Group } }), {
    live: true,
});
const authProviders = useSharedHybridQuery<AuthProviderDto>(
    () => ({ selector: { type: DocType.AuthProvider } }),
    { live: true },
);

const providerOptions = computed(() => [
    { label: "Choose a provider this user belongs to", value: "" },
    ...authProviders.value.map((p) => ({
        label: p.label || p.domain || "Unnamed provider",
        value: p._id,
    })),
]);

const selectedProviderId = computed({
    get: () => editable.value?.providerId ?? "",
    set: (value: string | number | null | undefined) => {
        if (!editable.value) return;
        const next = typeof value === "string" && value.length > 0 ? value : undefined;
        editable.value.providerId = next;
    },
});

const hasGroupsSelected = computed(() => editable.value && editable.value.memberOf.length > 0);
const isEmailFilled = computed(() => editable.value && editable.value.email.trim().length > 0);
const isNameFilled = computed(() => editable.value && editable.value.name.trim().length > 0);

const canEditOrCreate = computed(() => {
    if (editable.value) {
        return verifyAccess(editable.value.memberOf, DocType.User, AclPermission.Edit, "any");
    }
    return hasAnyPermission(DocType.User, AclPermission.Edit);
});

const canDelete = computed(() => {
    if (!editable.value) return false;
    return verifyAccess(editable.value.memberOf, DocType.User, AclPermission.Delete, "any");
});

const revertChanges = () => {
    userEditable.revert(currentId.value);
};

const deleteUser = async () => {
    const doc = editable.value;
    if (!doc) return;

    if (!canDelete.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You do not have delete permission",
            state: "error",
        });
        return;
    }

    const userId = doc._id;
    const userName = doc.name;
    const res = await userEditable.remove(userId);

    if (res?.ack !== AckStatus.Accepted) {
        addNotification({
            title: "Failed to delete user",
            description: res?.message ?? "The user could not be deleted",
            state: "error",
        });
        return;
    }

    addNotification({
        title: `${capitaliseFirstLetter(userName)} deleted`,
        description: `The user was successfully deleted`,
        state: "success",
    });

    emit("close");
    router.push("/users");
};

const save = async () => {
    const doc = editable.value;
    if (!doc) return;

    doc.updatedTimeUtc = Date.now();
    const res = await userEditable.save(doc._id);

    useNotificationStore().addNotification({
        title: res && res.ack == AckStatus.Accepted ? `${doc.name} saved` : "Error saving changes",
        description:
            res && res.ack == AckStatus.Accepted
                ? ""
                : `Failed to save changes with error: ${res ? res.message : "Unknown error"}`,
        state: res && res.ack == AckStatus.Accepted ? "success" : "error",
    });
    emit("close");
};

const saveDisabled = computed(() => {
    return (
        !isDirty.value || !hasGroupsSelected.value || !isEmailFilled.value || !isNameFilled.value
    );
});
</script>

<template>
    <LDialog
        :open="isVisible"
        @update:open="(val: boolean | undefined) => !val && emit('close')"
        :title="!isNew ? `Edit User` : 'Create New User'"
        @close.stop="emit('close')"
        :primaryAction="() => save()"
        :primaryButtonText="!isNew ? 'Save' : 'Create'"
        :primaryButtonDisabled="saveDisabled"
        :secondaryAction="() => emit('close')"
        secondaryButtonText="Cancel"
        stickToEdges
    >
        <div>
            <LBadge v-if="isLoading" variant="warning">Loading...</LBadge>
            <LBadge v-else-if="!isConnected" variant="warning"
                >You can not create or edit users when offline...</LBadge
            >
            <LBadge v-if="!hasGroupsSelected" variant="error" class="mr-2"
                >No groups selected</LBadge
            >
            <LBadge v-if="isDirty" variant="warning" class="mr-2">Unsaved changes</LBadge>
        </div>
        <LCard v-if="editable" class="!border-0 !p-0">
            <LInput
                label="Name"
                name="userName"
                v-model="editable.name"
                class="mb-4 w-full"
                placeholder="Enter user name"
                :disabled="!canEditOrCreate"
                data-test="userName"
            />

            <LInput
                label="Email"
                name="userEmail"
                v-model="editable.email"
                class="mb-4 w-full"
                placeholder="Enter email"
                :disabled="!canEditOrCreate"
                data-test="userEmail"
            />

            <LSelect
                label="Auth Provider"
                :options="providerOptions"
                v-model="selectedProviderId"
                class="mb-4 w-full"
                :disabled="!canEditOrCreate"
                data-test="userProvider"
            />

            <LCombobox
                v-model:selected-options="editable.memberOf as string[]"
                :label="`Group Membership`"
                :options="
                    groups.map((group: GroupDto) => ({
                        id: group._id,
                        label: group.name,
                        value: group._id,
                    }))
                "
                :show-selected-in-dropdown="false"
                :showSelectedLabels="true"
                :disabled="!canEditOrCreate"
                data-test="groupSelector"
            />
        </LCard>

        <template #footer-extra>
            <LButton
                v-if="!isNew"
                type="button"
                @click="
                    () => {
                        showDeleteModal = true;
                    }
                "
                data-test="delete-button"
                variant="secondary"
                context="danger"
                :icon="TrashIcon"
                :disabled="!canDelete"
            >
                Delete
            </LButton>

            <LButton
                type="button"
                variant="secondary"
                v-if="isDirty && !isNew"
                @click="revertChanges"
                :icon="ArrowUturnLeftIcon"
                class="ml-1"
            >
                Revert
            </LButton>
        </template>

        <LDialog
            v-model:open="showDeleteModal"
            :title="`Delete ${editable?.name ?? 'user'}?`"
            :description="`Are you sure you want to delete this user? This action cannot be undone.`"
            :primaryAction="
                async () => {
                    showDeleteModal = false;
                    await deleteUser();
                }
            "
            :secondaryAction="() => (showDeleteModal = false)"
            primaryButtonText="Delete"
            secondaryButtonText="Cancel"
            context="danger"
            :showClosingButton="false"
        />
    </LDialog>
</template>
