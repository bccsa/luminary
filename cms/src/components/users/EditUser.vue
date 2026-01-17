<script setup lang="ts">
import LBadge from "../common/LBadge.vue";
import LButton from "../button/LButton.vue";
import LCard from "../common/LCard.vue";
import LInput from "../forms/LInput.vue";
import {
    AclPermission,
    ApiLiveQuery,
    DocType,
    isConnected,
    hasAnyPermission,
    verifyAccess,
    type ApiSearchQuery,
    type UserDto,
    type Uuid,
    getRest,
    AckStatus,
    useDexieLiveQuery,
    db,
    type GroupDto,
} from "luminary-shared";
import { computed, ref, toRaw, watch } from "vue";
import _ from "lodash";
import { useNotificationStore } from "@/stores/notification";
import { ArrowUturnLeftIcon, FolderArrowDownIcon, TrashIcon, PlusCircleIcon } from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import LCombobox from "../forms/LCombobox.vue";

type Props = {
    id: Uuid;
    isVisible: boolean;
};
const props = defineProps<Props>();

const emit = defineEmits(["close"]);

const userQuery = ref<ApiSearchQuery>({
    types: [DocType.User],
    docId: props.id,
});

const apiLiveQuery = new ApiLiveQuery<UserDto>(userQuery);
const original = apiLiveQuery.toRef();
const isLoading = apiLiveQuery.isLoadingAsRef();

const { addNotification } = useNotificationStore();

const showDeleteModal = ref(false);

const editable = ref<UserDto>({
    _id: props.id,
    type: DocType.User,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    email: "",
    name: "New user",
});

// Clone the original user when it's loaded into the editable object
const originalLoadedHandler = watch(original, () => {
    if (!original.value) return;
    editable.value = _.cloneDeep(original.value);

    originalLoadedHandler();
});

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

// Check if the user is dirty (has unsaved changes)
const isDirty = ref(false);
watch(
    [editable, original],
    () => {
        if (!original.value) {
            isDirty.value = true;
            return;
        }

        isDirty.value = !_.isEqual(
            { ...toRaw(original.value), updatedTimeUtc: 0, _rev: "" },
            { ...toRaw(editable.value), updatedTimeUtc: 0, _rev: "" },
        );
    },
    { deep: true, immediate: true },
);

// Track if this is a new user
const isNew = computed(() => !original.value?._id);

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
    editable.value = _.cloneDeep(original.value) as UserDto;
};

const deleteUser = async () => {
    if (!editable.value) return;

    if (!canDelete.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You do not have delete permission",
            state: "error",
        });
        return;
    }

    editable.value.deleteReq = 1;

    await save();

    addNotification({
        title: `${capitaliseFirstLetter(editable.value.name)} deleted`,
        description: `The user was successfully deleted`,
        state: "success",
    });

    router.push("/users");
};

const save = async () => {
    // Bypass save if the user is new and marked for deletion
    if (isNew.value && editable.value.deleteReq) {
        return;
    }

    const res = await getRest().changeRequest({
        id: 1, // Not used for direct API change request calls.
        doc: editable.value,
    });

    if (!editable.value.deleteReq) {
        useNotificationStore().addNotification({
            title:
                res && res.ack == AckStatus.Accepted
                    ? `${editable.value.name} saved`
                    : "Error saving changes",
            description:
                res && res.ack == AckStatus.Accepted
                    ? ""
                    : `Failed to save changes with error: ${res ? res.message : "Unknown error"}`,
            state: res && res.ack == AckStatus.Accepted ? "success" : "error",
        });
    }
};
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
        <div class="w-[500px] rounded-lg bg-white p-6 shadow-lg">

            <h2 class="mb-4 text-xl font-bold">
                {{ !isNew ? "Edit User" : "Create new User" }}
            </h2>
            <span v-if="isLoading">Loading...</span>
            <span v-else-if="!isConnected">Offline...</span>
            <div v-else class="space-y-2">
            <LCard class="!border-0 rounded-lg bg-white shadow-lg">
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
        </div>
        <div v-if="!isLoading && isConnected" class="flex gap-2">
                <div class="flex gap-1 mt-4">
                <LBadge v-if="!hasGroupsSelected" variant="error" class="mr-2"
                    >No groups selected</LBadge
                >
                    <LBadge v-if="isDirty" variant="warning" class="mr-2">Unsaved changes</LBadge>
                    <LButton
                    variant="secondary"
                    data-test="cancel"
                    @click="emit('close')"
                    :icon="ArrowUturnLeftIcon"
                    >Cancel</LButton
                >
                    <LButton
                        type="button"
                        variant="secondary"
                        v-if="isDirty && !isNew"
                        @click="revertChanges"
                        :icon="ArrowUturnLeftIcon"
                        >Revert</LButton
                    >
                    <LButton
                        type="button"
                        @click="save"
                        data-test="save-button"
                        variant="primary"
                        :disabled="!isDirty || !hasGroupsSelected || !isEmailFilled || !isNameFilled"
                        :icon="!isNew ? FolderArrowDownIcon : PlusCircleIcon"
                >
                    {{ !isNew ? "Save" : "Create" }}
                    </LButton>
                    <LButton
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
                </div>
            </div>
    </div>
    </div>


    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${editable.name}?`"
        :description="`Are you sure you want to delete this user? This action cannot be undone.`"
        :primaryAction="
            () => {
                showDeleteModal = false;
                deleteUser();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>
