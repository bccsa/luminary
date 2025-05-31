<script setup lang="ts">
import OnlineIndicator from "../OnlineIndicator.vue";
import ProfileMenu from "./ProfileMenu.vue";
</script>

<template>
    <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div class="relative flex flex-1 items-center justify-between gap-2">
            <slot name="quickActions" />
        </div>
        <div class="flex items-center">
            <OnlineIndicator />
        </div>
        <div class="flex items-center gap-x-4 lg:gap-x-6">
            <ProfileMenu />
        </div>
    </div>
</template>
