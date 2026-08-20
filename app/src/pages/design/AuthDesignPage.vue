<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AuthArtboard from "./AuthArtboard.vue";
import SignInMethodsScreen from "@/components/auth/kratos/SignInMethodsScreen.vue";
import EmailIdentifierScreen from "@/components/auth/kratos/EmailIdentifierScreen.vue";
import OneTimeCodeScreen from "@/components/auth/kratos/OneTimeCodeScreen.vue";
import RegistrationScreen from "@/components/auth/kratos/RegistrationScreen.vue";
import AuthDoneScreen from "@/components/auth/kratos/AuthDoneScreen.vue";
import GuestWelcomeScreen from "@/components/auth/kratos/GuestWelcomeScreen.vue";
import GuestGateCard from "@/components/auth/kratos/GuestGateCard.vue";
import GuestUpgradeScreen from "@/components/auth/kratos/GuestUpgradeScreen.vue";
import AccountSettingsScreen from "@/components/auth/kratos/AccountSettingsScreen.vue";
import AuthErrorScreen from "@/components/auth/kratos/AuthErrorScreen.vue";
import type { AuthProviderOption } from "@/components/auth/kratos/types";

type Theme = "light" | "dark";
const themeMode = ref<"light" | "dark" | "both">("both");
const themes = computed<Theme[]>(() =>
    themeMode.value === "both" ? ["light", "dark"] : [themeMode.value],
);

// The artboards paint their own theme through a `.dark` wrapper, so the app-wide
// class has to come off while this page is mounted or every board renders dark.
let hadDarkClass = false;
onMounted(() => {
    hadDarkClass = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
});
onBeforeUnmount(() => {
    if (hadDarkClass) document.documentElement.classList.add("dark");
});

const providers: AuthProviderOption[] = [
    { id: "bcc", label: "Continue with BCC", backgroundColor: "#1e3a5f", textColor: "#ffffff" },
    { id: "google", label: "Continue with Google" },
];

const email = ref("");
const emailInvalid = ref("not-an-email");
const recoveryEmail = ref("");
const registerEmail = ref("");
const registerName = ref("");
const code = ref("");
const codeWrong = ref("418293");
const verifyCode = ref("40");

const sessions = [
    {
        id: "1",
        device: "iPhone 14 · Safari",
        location: "Cape Town",
        lastSeen: "Active now",
        current: true,
    },
    { id: "2", device: "MacBook Pro · Chrome", location: "Cape Town", lastSeen: "2 hours ago" },
    { id: "3", device: "Android · Chrome", location: "Oslo", lastSeen: "12 March" },
];

const methods = [
    { id: "email", label: "Email code", linked: true },
    { id: "bcc", label: "BCC", linked: false },
];

const sections = [
    {
        id: "guest",
        title: "Guest",
        note: "No Kratos session at all — the API already serves anonymous callers their default groups.",
    },
    {
        id: "login",
        title: "Login — email one-time code",
        note: "self-service/login/browser, method=code",
    },
    {
        id: "register",
        title: "Registration & verification",
        note: "self-service/registration/browser + self-service/verification/browser",
    },
    {
        id: "recover",
        title: "Recovery, account & errors",
        note: "self-service/recovery/browser, self-service/settings/browser, self-service/errors",
    },
];
</script>

<template>
    <div class="min-h-screen bg-zinc-100 pb-24">
        <header
            class="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur"
        >
            <div class="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                    <h1 class="text-lg font-semibold text-zinc-900">Guest auth — Ory Kratos</h1>
                    <p class="text-sm text-zinc-500">
                        Every screen is a real component from
                        <code class="font-mono text-xs">src/components/auth/kratos/</code>. Type in
                        them — they work.
                    </p>
                </div>
                <div class="flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1">
                    <button
                        v-for="option in ['light', 'dark', 'both'] as const"
                        :key="option"
                        type="button"
                        class="rounded px-3 py-1 text-sm font-medium capitalize"
                        :class="
                            themeMode === option
                                ? 'bg-zinc-900 text-white'
                                : 'text-zinc-600 hover:bg-zinc-100'
                        "
                        @click="themeMode = option"
                    >
                        {{ option }}
                    </button>
                </div>
            </div>
            <nav class="mt-3 flex flex-wrap gap-3">
                <a
                    v-for="section in sections"
                    :key="section.id"
                    :href="`#${section.id}`"
                    class="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
                >
                    {{ section.title }}
                </a>
            </nav>
        </header>

        <main class="flex flex-col gap-12 px-6 py-8">
            <!-- Guest -->
            <section
                id="guest"
                class="flex flex-col gap-4"
            >
                <div>
                    <h2 class="text-base font-semibold text-zinc-900">{{ sections[0].title }}</h2>
                    <p class="text-sm text-zinc-500">{{ sections[0].note }}</p>
                </div>
                <div class="flex flex-wrap gap-6">
                    <template
                        v-for="theme in themes"
                        :key="`welcome-${theme}`"
                    >
                        <AuthArtboard
                            title="First run — sign in or look around"
                            flow="no flow · app decides"
                            :theme="theme"
                        >
                            <GuestWelcomeScreen app-name="Luminary" />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Guest hits a gated action"
                            flow="no flow · inline prompt"
                            :theme="theme"
                        >
                            <GuestGateCard />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Guest → account"
                            flow="registration/browser"
                            :theme="theme"
                        >
                            <GuestUpgradeScreen :bookmark-count="12" />
                        </AuthArtboard>
                    </template>
                </div>
            </section>

            <!-- Login -->
            <section
                id="login"
                class="flex flex-col gap-4"
            >
                <div>
                    <h2 class="text-base font-semibold text-zinc-900">{{ sections[1].title }}</h2>
                    <p class="font-mono text-sm text-zinc-500">{{ sections[1].note }}</p>
                </div>
                <div class="flex flex-wrap gap-6">
                    <template
                        v-for="theme in themes"
                        :key="`login-${theme}`"
                    >
                        <AuthArtboard
                            title="Choose a method"
                            flow="login flow · groups: code, oidc"
                            :theme="theme"
                        >
                            <SignInMethodsScreen :providers="providers" />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Choose a method — email only"
                            flow="login flow · group: code"
                            :theme="theme"
                        >
                            <SignInMethodsScreen />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Identifier step"
                            flow="POST ui.action · method=code"
                            :theme="theme"
                        >
                            <EmailIdentifierScreen v-model="email" />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Identifier step — invalid address"
                            flow="ui.nodes[identifier].messages"
                            :theme="theme"
                        >
                            <EmailIdentifierScreen
                                v-model="emailInvalid"
                                error="That doesn't look like an email address."
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Code step"
                            flow="POST ui.action · code + resend"
                            :theme="theme"
                        >
                            <OneTimeCodeScreen
                                v-model="code"
                                email="johan@example.com"
                                :resend-in="42"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Code step — wrong code"
                            flow="ui.messages 4010008"
                            :theme="theme"
                        >
                            <OneTimeCodeScreen
                                v-model="codeWrong"
                                email="johan@example.com"
                                :resend-in="18"
                                :message="{
                                    type: 'error',
                                    text: `That code isn't right. Check it and try again.`,
                                }"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Code step — expired"
                            flow="ui.messages 4060004 · resend enabled"
                            :theme="theme"
                        >
                            <OneTimeCodeScreen
                                email="johan@example.com"
                                :message="{
                                    type: 'error',
                                    text: 'This code has expired. Ask for a new one.',
                                }"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Code step — rate limited"
                            flow="HTTP 429 from Kratos"
                            :theme="theme"
                        >
                            <OneTimeCodeScreen
                                email="johan@example.com"
                                :resend-in="60"
                                :message="{
                                    type: 'error',
                                    text: 'Too many tries. Wait a minute, then ask for a new code.',
                                }"
                            />
                        </AuthArtboard>
                    </template>
                </div>
            </section>

            <!-- Registration -->
            <section
                id="register"
                class="flex flex-col gap-4"
            >
                <div>
                    <h2 class="text-base font-semibold text-zinc-900">{{ sections[2].title }}</h2>
                    <p class="font-mono text-sm text-zinc-500">{{ sections[2].note }}</p>
                </div>
                <div class="flex flex-wrap gap-6">
                    <template
                        v-for="theme in themes"
                        :key="`register-${theme}`"
                    >
                        <AuthArtboard
                            title="Create an account"
                            flow="registration flow · traits + method=code"
                            :theme="theme"
                        >
                            <RegistrationScreen
                                v-model:email="registerEmail"
                                v-model:name="registerName"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Create an account — already registered"
                            flow="ui.messages 4000007"
                            :theme="theme"
                        >
                            <RegistrationScreen
                                email="johan@example.com"
                                name="Johan"
                                :message="{
                                    type: 'info',
                                    text: 'That address already has an account — sign in instead.',
                                }"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Confirm your email"
                            flow="verification flow · method=code"
                            :theme="theme"
                        >
                            <OneTimeCodeScreen
                                v-model="verifyCode"
                                email="johan@example.com"
                                mode="verification"
                                :resend-in="30"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Verified"
                            flow="session issued · redirect to return_to"
                            :theme="theme"
                        >
                            <AuthDoneScreen />
                        </AuthArtboard>
                    </template>
                </div>
            </section>

            <!-- Recovery, settings, errors -->
            <section
                id="recover"
                class="flex flex-col gap-4"
            >
                <div>
                    <h2 class="text-base font-semibold text-zinc-900">{{ sections[3].title }}</h2>
                    <p class="font-mono text-sm text-zinc-500">{{ sections[3].note }}</p>
                </div>
                <div class="flex flex-wrap gap-6">
                    <template
                        v-for="theme in themes"
                        :key="`recover-${theme}`"
                    >
                        <AuthArtboard
                            title="Recover an account"
                            flow="recovery flow · method=code"
                            :theme="theme"
                        >
                            <EmailIdentifierScreen
                                v-model="recoveryEmail"
                                mode="recovery"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Recovery sent"
                            flow="ui.messages 1060003 · deliberately vague"
                            :theme="theme"
                        >
                            <EmailIdentifierScreen
                                mode="recovery"
                                :message="{
                                    type: 'success',
                                    text: 'If that address has an account, a code is on its way.',
                                }"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Account"
                            flow="settings flow + GET /sessions"
                            :theme="theme"
                        >
                            <AccountSettingsScreen
                                email="johan@example.com"
                                :methods="methods"
                                :sessions="sessions"
                            />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Flow expired"
                            flow="410 Gone · restart the flow"
                            :theme="theme"
                        >
                            <AuthErrorScreen kind="expired" />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Offline"
                            flow="never reaches Kratos"
                            :theme="theme"
                        >
                            <AuthErrorScreen kind="offline" />
                        </AuthArtboard>
                        <AuthArtboard
                            title="Unhandled error"
                            flow="self-service/errors?id="
                            :theme="theme"
                        >
                            <AuthErrorScreen
                                kind="generic"
                                detail="We couldn't finish signing you in. Trying again usually sorts it out."
                                error-id="a1f0c7e2"
                            />
                        </AuthArtboard>
                    </template>
                </div>
            </section>
        </main>
    </div>
</template>
