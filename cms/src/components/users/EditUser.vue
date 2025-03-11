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

type Props = {
    id: Uuid;
};

const usersQuery: ApiSearchQuery = {
    types: [DocType.User],
};
const users = ref<Map<string, UserDto>>(new Map());
provide("users", users);

const props = defineProps<Props>();
const isLocalChange = db.isLocalChangeAsRef(props.id);

const getDbUsers = async () => {
    const _s = Object.fromEntries(users.value);
    const latest = Object.values(_s).reduce((acc, curr) => {
        return curr.updatedTimeUtc > acc ? curr.updatedTimeUtc : acc;
    }, 0);

    latest ? (usersQuery.from = latest) : delete usersQuery.from;
    const _q = await getRest().search(usersQuery);
    _q &&
        _q.docs &&
        _q.docs.forEach((d: UserDto) => {
            users.value.set(d._id, d);
        });
};
getDbUsers();

const userData = users.value;
const original = ref<UserDto | null>(null);
const isDirty = ref(false);

const editable = ref<UserDto>({
    _id: props.id,
    type: DocType.User,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    email: "",
    name: "New user",
});

watch(
    () => userData.get(props.id),
    (user) => {
        if (user) {
            original.value = _.cloneDeep(user); // Update the original object
            Object.assign(editable.value, user); // Instead of overwriting, update fields reactively
        }
    },
    { immediate: true, deep: true },
);

// Check if the language is dirty (has unsaved changes)
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
        return verifyAccess(editable.value.memberOf, DocType.User, AclPermission.Edit, "all");
    }
    return hasAnyPermission(DocType.Language, AclPermission.Edit);
});

const revertChanges = () => {
    editable.value = _.cloneDeep(original.value) as UserDto;
};
const save = async () => {
    original.value = _.cloneDeep(editable.value);
    await db.upsert(editable.value);

    useNotificationStore().addNotification({
        title: "User saved",
        description: "User saved successfully",
        state: "success",
    });
};
</script>

<template>
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
                        >Revert</LButton
                    >
                    <LButton
                        type="button"
                        @click="save"
                        data-test="save-button"
                        variant="primary"
                        :disabled="!isDirty || !hasGroupsSelected"
                    >
                        Save
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
                />

                <LInput
                    label="Email"
                    name="userEmail"
                    v-model="editable.email"
                    class="mb-4 w-full"
                    placeholder="Enter email"
                    :disabled="!canEditOrCreate"
                />

                <GroupSelector
                    v-model:groups="editable.memberOf"
                    :docType="DocType.User"
                    data-test="group-selector"
                    :disabled="!canEditOrCreate"
                />
            </LCard>
        </div>
    </BasePage>
</template>
