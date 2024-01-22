<script setup lang="ts">
import ProfileMenu from "./ProfileMenu.vue";
</script>

<template>
    <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div class="relative flex flex-1"><!-- place for search field--></div>
        <div class="flex items-center gap-x-4 lg:gap-x-6">
            <ProfileMenu />
        </div>
    </div>
</template>
