<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserDisplayCard from "@/components/users/UserDisplayCard.vue";
import EditUser from "@/components/users/EditUser.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    type UserDto,
    type ApiSearchQuery,
    ApiLiveQuery,
} from "luminary-shared";
import { computed, ref, onBeforeUnmount } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

const usersQuery = ref<ApiSearchQuery>({
    types: [DocType.User],
});

const apiLiveQuery = new ApiLiveQuery<UserDto>(usersQuery);
const users = apiLiveQuery.toArrayAsRef();

onBeforeUnmount(() => {
    apiLiveQuery.stopLiveQuery();
});

const isEditUserModalVisible = ref(false);
const isNewUserModalVisible = ref(false);
const selectedUserId = ref<string>("");
</script>

<template>
    <BasePage title="User overview" :is-full-width="true">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isNewUserModalVisible = true"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-8 w-8 text-zinc-500 hover:text-zinc-700 cursor-pointer hover:bg-zinc-300 bg-zinc-100 p-1 rounded"
                    @click="isNewUserModalVisible = true"
                />
            </div>
        </template>
        <p class="mb-4 p-2 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <UserDisplayCard 
            v-for="user in users" 
            :key="user._id" 
            :usersDoc="user" 
            v-model="isEditUserModalVisible" 
            @edit="(id) => selectedUserId = id"
        />

        <EditUser v-if="isEditUserModalVisible" 
                  :isVisible="isEditUserModalVisible" 
                  :id="selectedUserId"
                  @close="isEditUserModalVisible = false"
        />

        <EditUser v-if="isNewUserModalVisible"
                  :isVisible="isNewUserModalVisible"
                  :id="db.uuid()"
                  @close="isNewUserModalVisible = false"
        />
    </BasePage>
</template>
