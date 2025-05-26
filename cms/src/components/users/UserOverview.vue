<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserTable from "@/components/users/UserTable.vue";
</script>

<template>
    <BasePage :is-full-width="true">
        <p class="mb-4 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <UserTable />
    </BasePage>
</template>
