<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import SignInMethodsScreen from "@/components/auth/kratos/SignInMethodsScreen.vue";
import EmailIdentifierScreen from "@/components/auth/kratos/EmailIdentifierScreen.vue";
import OneTimeCodeScreen from "@/components/auth/kratos/OneTimeCodeScreen.vue";
import RegistrationScreen from "@/components/auth/kratos/RegistrationScreen.vue";
import AuthDoneScreen from "@/components/auth/kratos/AuthDoneScreen.vue";
import AuthErrorScreen from "@/components/auth/kratos/AuthErrorScreen.vue";
import { browserInitUrl } from "@/auth/kratos/client";
import { useKratosAuth } from "@/auth/kratos/useKratosAuth";
import type { FlowType } from "@/auth/kratos/types";

const props = defineProps<{ flowType: FlowType }>();

const route = useRoute();
const router = useRouter();
const {
    step,
    busy,
    email,
    name,
    code,
    message,
    failure,
    resendIn,
    providers,
    start,
    submitIdentifier,
    submitCode,
    resend,
    changeIdentifier,
    chooseProvider,
    restart,
} = useKratosAuth(props.flowType);

// Where success lands. Kratos only honours `return_to` values its config allows,
// so an unlisted one is dropped there rather than trusted here.
const returnTo = computed(() => (route.query.return_to as string) || "/");

// A login flow that also offers social providers opens on the chooser; an
// email-only configuration skips it, because a one-item menu is not a choice.
const showMethods = ref(props.flowType === "login");

onMounted(async () => {
    const flowId = route.query.flow as string | undefined;
    const loginChallenge = route.query.login_challenge as string | undefined;

    // Hydra sent the user here to authenticate. Hand the challenge to Kratos by
    // navigating: it either completes the OAuth2 login outright (an existing
    // session) or bounces back here with a flow id for the screens below.
    if (loginChallenge && !flowId) {
        window.location.assign(browserInitUrl(props.flowType, { loginChallenge }));
        return;
    }

    await start(flowId, returnTo.value);
    // Already signed in: show the account rather than an error about a flow
    // Kratos was right to refuse.
    if (step.value === "signed-in") {
        router.replace("/auth/account");
        return;
    }
    if (props.flowType !== "login" || !providers.value.length) showMethods.value = false;
});

const codeMode = computed(() => (props.flowType === "verification" ? "verification" : "login"));
const identifierMode = computed(() => (props.flowType === "recovery" ? "recovery" : "login"));
const flowMessage = computed(() => message.value ?? undefined);

const leave = () => router.push(returnTo.value);

/** Back from the address step returns to the chooser when there is one to return to. */
function backFromIdentifier() {
    if (providers.value.length) {
        showMethods.value = true;
        return;
    }
    leave();
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-slate-900">
        <LoadingSpinner v-if="step === 'loading'" />

        <SignInMethodsScreen
            v-else-if="showMethods && step === 'identifier'"
            :providers="providers"
            :message="flowMessage"
            @email="showMethods = false"
            @provider="chooseProvider"
            @guest="leave"
        />

        <RegistrationScreen
            v-else-if="step === 'identifier' && flowType === 'registration'"
            v-model:email="email"
            v-model:name="name"
            :message="flowMessage"
            :busy="busy"
            @submit="submitIdentifier"
            @sign-in="router.push('/auth/login')"
            @back="leave"
        />

        <EmailIdentifierScreen
            v-else-if="step === 'identifier'"
            v-model="email"
            :mode="identifierMode"
            :message="flowMessage"
            :busy="busy"
            @submit="submitIdentifier"
            @back="backFromIdentifier"
        >
            <template
                v-if="flowType === 'login'"
                #footer
            >
                <button
                    type="button"
                    class="w-full text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100"
                    @click="router.push('/auth/signup')"
                >
                    Create an account
                </button>
            </template>
        </EmailIdentifierScreen>

        <OneTimeCodeScreen
            v-else-if="step === 'code'"
            v-model="code"
            :email="email"
            :mode="codeMode"
            :message="flowMessage"
            :busy="busy"
            :resend-in="resendIn"
            @submit="submitCode"
            @resend="resend"
            @change-email="changeIdentifier"
            @back="changeIdentifier"
        />

        <AuthDoneScreen
            v-else-if="step === 'done'"
            @continue="leave"
        />

        <AuthErrorScreen
            v-else-if="step === 'expired'"
            kind="expired"
            @restart="restart"
            @back="leave"
        />

        <AuthErrorScreen
            v-else-if="step === 'offline'"
            kind="offline"
            @restart="restart"
            @back="leave"
        />

        <AuthErrorScreen
            v-else
            kind="generic"
            :detail="failure"
            @restart="restart"
            @back="leave"
        />
    </div>
</template>
