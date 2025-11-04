<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserTable from "@/components/users/UserTable.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, db, DocType, hasAnyPermission } from "luminary-shared";
import { computed } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

const createNew = () => {
    router.push({ name: "user", params: { id: db.uuid() } });
};
</script>

<template>
    <BasePage :is-full-width="true" title="User overview" :should-show-page-title="false">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'user', params: { id: db.uuid() } })"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-6 w-6 text-zinc-500"
                    @click="createNew"
                />
            </div>
        </template>
        <p class="mb-4 p-2 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <UserTable />
    </BasePage>
</template>
