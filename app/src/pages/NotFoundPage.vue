<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useAuth0 } from "@auth0/auth0-vue";

const { isAuthenticated, loginWithRedirect } = useAuth0();
</script>

<template>
    <div class="grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
        <div class="text-center">
            <h1
                class="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl"
            >
                {{ !isAuthenticated ? "Not logged in" : "Not Found" }}
            </h1>
            <p class="mt-6 text-base leading-7 text-zinc-600 dark:text-white">
                {{
                    !isAuthenticated
                        ? "You are not logged in. The content you are looking for might only be available to logged in users."
                        : "Sorry, we couldn’t find the page or the content you’re looking for."
                }}
            </p>
            <div v-if="isAuthenticated" class="mt-10 flex items-center justify-center gap-x-6">
                <RouterLink to="/" class="border-b-[1px] border-yellow-700 text-yellow-700">
                    Back to home
                </RouterLink>
            </div>
            <div v-else class="mt-10 flex items-center justify-center gap-x-1">
                Please click
                <span class="cursor-pointer text-yellow-700 underline" @click="loginWithRedirect()">
                    here
                </span>
                to log in.
            </div>
        </div>
    </div>
</template>
