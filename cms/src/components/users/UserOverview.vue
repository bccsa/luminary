<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserTable from "@/components/users/UserTable.vue";
import LButton from "@/components/button/LButton.vue";
import { AclPermission, db, DocType, hasAnyPermission } from "luminary-shared";
import { computed } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));
</script>

<template>
    <BasePage title="User overview">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'user', params: { id: db.uuid() } })"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
            </div>
        </template>
        <p class="mb-4 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <UserTable />
    </BasePage>
</template>
