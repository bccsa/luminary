<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
    <header class="flex items-center gap-8 p-8">
        <img alt="logo" class="w-64" src="@/assets/logo.svg" />

        <div>
            <nav class="flex gap-2">
                <RouterLink to="/" class="underline">Home</RouterLink>
                <RouterLink to="/about" class="underline">About</RouterLink>
            </nav>
        </div>
    </header>

    <main class="px-8">
        <RouterView />
    </main>
</template>
