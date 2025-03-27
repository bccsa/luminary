<script setup lang="ts">
import BasePage from "../BasePage.vue";
import LBadge from "../common/LBadge.vue";
import LButton from "../button/LButton.vue";
import LCard from "../common/LCard.vue";
import LInput from "../forms/LInput.vue";
import {
    AclPermission,
    DocType,
    db,
    getRest,
    hasAnyPermission,
    verifyAccess,
    type ApiSearchQuery,
    type UserDto,
    type Uuid,
} from "luminary-shared";
import { computed, provide, ref, toRaw, watch } from "vue";
import GroupSelector from "../groups/GroupSelector.vue";
import _ from "lodash";
import { useNotificationStore } from "@/stores/notification";
import { ArrowUturnLeftIcon, FolderArrowDownIcon, TrashIcon } from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import LoadingSpinner from "../LoadingSpinner.vue";

type Props = {
    id: Uuid;
};
const props = defineProps<Props>();

const usersQuery: ApiSearchQuery = {
    types: [DocType.User],
    docId: props.id,
};
const user = ref<UserDto>();
provide("users", user);

const isLocalChange = db.isLocalChangeAsRef(props.id);
const { addNotification } = useNotificationStore();

const getUser = async () => {
    const _q = await getRest().search(usersQuery);
    if (_q) {
        user.value = _q.docs[0];
    }
};
getUser();

const original = ref<UserDto | null>();
const isDirty = ref(false);
const showDeleteModal = ref(false);

const editable = ref<UserDto>({
    _id: props.id,
    type: DocType.User,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    email: "",
    name: "New user",
});

watch(
    () => user.value,
    (user) => {
        if (user) {
            original.value = _.cloneDeep(user); // Update the original object
            Object.assign(editable.value, user); // Instead of overwriting, update fields reactively
        }
    },
    { immediate: true, deep: true },
);

// Check if the user is dirty (has unsaved changes)
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

    save();

    addNotification({
        title: `${capitaliseFirstLetter(editable.value.name)} deleted`,
        description: `The user was successfully deleted`,
        state: "success",
    });

    router.push({
        name: "users",
    });
};
const save = async () => {
    // Bypass save if the user is new and marked for deletion
    if (isNew.value && editable.value.deleteReq) {
        return;
    }

    original.value = _.cloneDeep(editable.value);
    editable.value.updatedTimeUtc = Date.now();

    await db.upsert({ doc: editable.value, localChangesOnly: true });

    if (!editable.value.deleteReq) {
        useNotificationStore().addNotification({
            title: "User saved",
            description: "User saved successfully",
            state: "success",
        });
    }
};
</script>

<template>
    <div
        v-if="!isNew && !editable?.updatedTimeUtc"
        class="relative flex h-screen items-center justify-center"
    >
        <div class="flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-lg"><LoadingSpinner /> Loading...</div>
        </div>
    </div>
    <BasePage
        :title="editable?.name"
        :backLinkLocation="{ name: 'users' }"
        :backLinkText="`Users overview`"
        :backLinkParams="{
            docType: DocType.User,
        }"
        class="mb-16"
    >
        <template #actions>
            <div class="flex gap-2">
                <LBadge v-if="isLocalChange" variant="warning">Offline changes</LBadge>
                <LBadge v-if="!hasGroupsSelected" variant="error" class="mr-2"
                    >No groups selected</LBadge
                >
                <div class="flex gap-1">
                    <LBadge v-if="isDirty" variant="warning" class="mr-2">Unsaved changes</LBadge>
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
                        :disabled="!isDirty || !hasGroupsSelected"
                        :icon="FolderArrowDownIcon"
                    >
                        Save
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
        </template>
        <div class="space-y-2">
            <LCard class="rounded-lg bg-white shadow-lg">
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

                <GroupSelector
                    v-model:groups="editable.memberOf"
                    :docType="DocType.User"
                    data-test="groupSelector"
                    :disabled="!canEditOrCreate"
                />
            </LCard>
        </div>
    </BasePage>

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${editable.name}?`"
        :description="`Are you sure you want to delete this user? This user will be no longer able to have access! This action cannot be undone.`"
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
