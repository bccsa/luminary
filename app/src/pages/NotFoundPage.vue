<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";

const { isAuthenticated, loginWithRedirect } = useAuthWithPrivacyPolicy();

const { t } = useI18n();
</script>

<template>
    <div class="grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
        <div class="text-center">
            <h1
                class="mt-4 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl"
            >
                {{
                    !isAuthenticated
                        ? t("notfoundpage.unauthenticated.title")
                        : t("notfoundpage.authenticated.title")
                }}
            </h1>
            <p class="mt-6 text-base leading-7 text-zinc-600 dark:text-white">
                {{
                    !isAuthenticated
                        ? t("notfoundpage.unauthenticated.description")
                        : t("notfoundpage.authenticated.description")
                }}
            </p>
            <div v-if="isAuthenticated" class="mt-10 flex items-center justify-center gap-x-6">
                <RouterLink to="/" class="text-yellow-700 underline">
                    {{ t("notfoundpage.navigation.home") }}</RouterLink
                >
            </div>
            <div v-else class="mt-10 flex items-center justify-center gap-x-1">
                {{ t("notfoundpage.unauthenticated.loginPrompt.before") }}
                <span class="cursor-pointer text-yellow-700 underline" @click="loginWithRedirect()">
                    {{ t("notfoundpage.unauthenticated.loginPrompt.linkText") }}
                </span>
                {{ t("notfoundpage.unauthenticated.loginPrompt.after") }}
            </div>
        </div>
    </div>
</template>
