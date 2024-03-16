<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
    <div class="grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
        <div class="text-center">
            <p class="text-base font-semibold text-yellow-600">404</p>
            <h1 class="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
                Page not found
            </h1>
            <p class="mt-6 text-base leading-7 text-zinc-600">
                Sorry, we couldn’t find the page you’re looking for.
            </p>
            <div class="mt-10 flex items-center justify-center gap-x-6">
                <RouterLink to="/" class="text-yellow-700 underline"> Back to home </RouterLink>
            </div>
        </div>
    </div>
</template>
