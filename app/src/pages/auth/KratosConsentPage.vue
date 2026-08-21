<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import ConsentScreen from "@/components/auth/kratos/ConsentScreen.vue";
import AuthErrorScreen from "@/components/auth/kratos/AuthErrorScreen.vue";
import { apiUrl } from "@/globalConfig";
import type { ConsentView } from "@/auth/kratos/types";

const route = useRoute();
// The challenge is the only credential this page has or needs — Hydra issues it
// per request, and the API is what actually talks to Hydra's admin API.
const challenge = route.query.consent_challenge as string | undefined;

const view = ref<ConsentView | null>(null);
const remember = ref(false);
const busy = ref(false);
const failed = ref(false);

onMounted(async () => {
    if (!challenge) {
        failed.value = true;
        return;
    }
    try {
        const response = await fetch(
            `${apiUrl}/oauth/consent/request?consent_challenge=${encodeURIComponent(challenge)}`,
        );
        if (!response.ok) throw new Error(String(response.status));
        view.value = (await response.json()) as ConsentView;
    } catch {
        failed.value = true;
    }
});

async function decide(accept: boolean) {
    if (!challenge || busy.value) return;
    busy.value = true;
    try {
        const response = await fetch(`${apiUrl}/oauth/consent/decision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                consent_challenge: challenge,
                accept,
                remember: remember.value,
            }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const { redirect_to } = (await response.json()) as { redirect_to: string };
        // Hydra decides where this goes next, for a refusal as much as a grant.
        window.location.assign(redirect_to);
    } catch {
        failed.value = true;
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-slate-900">
        <AuthErrorScreen
            v-if="failed"
            kind="generic"
            detail="This authorisation request could not be completed."
            @restart="$router.push('/')"
            @back="$router.push('/')"
        />
        <LoadingSpinner v-else-if="!view" />
        <ConsentScreen
            v-else
            v-model:remember="remember"
            :client-name="view.clientName"
            :logo-uri="view.logoUri"
            :scopes="view.scopes"
            :busy="busy"
            @allow="decide(true)"
            @deny="decide(false)"
        />
    </div>
</template>
