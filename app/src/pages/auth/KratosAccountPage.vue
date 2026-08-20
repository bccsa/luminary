<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import LButton from "@/components/button/LButton.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import AccountSettingsScreen from "@/components/auth/kratos/AccountSettingsScreen.vue";
import AuthErrorScreen from "@/components/auth/kratos/AuthErrorScreen.vue";
import type { ActiveSession } from "@/components/auth/kratos/AccountSettingsScreen.vue";
import { listOtherSessions, logout, signOutOtherSessions, whoami } from "@/auth/kratos/client";
import type { KratosSessionListEntry } from "@/auth/kratos/types";

const router = useRouter();
const loading = ref(true);
const session = ref<KratosSessionListEntry | null>(null);
const others = ref<KratosSessionListEntry[]>([]);

const email = computed(() => session.value?.identity?.traits.email ?? "");
const verified = computed(
    () => session.value?.identity?.verifiable_addresses?.some((a) => a.verified) ?? false,
);

/** A user agent is not a device name; this is only good enough to tell rows apart. */
function deviceName(agent?: string): string {
    if (!agent) return "Unknown device";
    for (const needle of ["iPhone", "iPad", "Android", "Macintosh", "Windows", "Linux"]) {
        if (agent.includes(needle)) return needle === "Macintosh" ? "Mac" : needle;
    }
    return agent.split("/")[0] || "Unknown device";
}

function toRow(entry: KratosSessionListEntry, current: boolean): ActiveSession {
    const device = entry.devices?.[0];
    return {
        id: entry.id,
        device: deviceName(device?.user_agent),
        location: device?.ip_address?.split(":")[0],
        lastSeen: entry.authenticated_at?.slice(0, 16).replace("T", " ") ?? "",
        current,
    };
}

// This device first: Kratos never includes the current session in the list.
const rows = computed<ActiveSession[]>(() => [
    ...(session.value ? [toRow(session.value, true)] : []),
    ...others.value.map((entry) => toRow(entry, false)),
]);

async function load() {
    loading.value = true;
    session.value = await whoami();
    others.value = session.value ? await listOtherSessions() : [];
    loading.value = false;
}
onMounted(load);

async function onSignOutOthers() {
    await signOutOtherSessions();
    await load();
}

async function onSignOut() {
    await logout();
    router.push("/auth/login");
}
</script>

<template>
    <div
        class="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-4 dark:bg-slate-900"
    >
        <LoadingSpinner v-if="loading" />

        <AuthErrorScreen
            v-else-if="!session"
            kind="generic"
            detail="You are not signed in."
            @restart="router.push('/auth/login')"
            @back="router.push('/')"
        />

        <template v-else>
            <AccountSettingsScreen
                :email="email"
                :email-verified="verified"
                :sessions="rows"
                :can-delete="false"
                @sign-out-others="onSignOutOthers"
            />
            <div class="w-full max-w-md">
                <LButton
                    variant="secondary"
                    size="lg"
                    class="w-full"
                    @click="onSignOut"
                >
                    Sign out
                </LButton>
            </div>
        </template>
    </div>
</template>
