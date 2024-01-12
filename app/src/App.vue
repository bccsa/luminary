<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
    <header class="flex flex-col items-center space-x-8 p-8 md:flex-row">
        <img alt="logo" class="w-64" src="@/assets/logo.svg" />

        <div>
            <nav class="flex space-x-2">
                <RouterLink to="/" class="underline">Home</RouterLink>
                <RouterLink to="/about" class="underline">About</RouterLink>
            </nav>
        </div>
    </header>

    <main class="px-8">
        <RouterView />
    </main>
</template>
