<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LLogo from "@/components/LLogo.vue";
import { useAuth0 } from "@auth0/auth0-vue";

const { loginWithRedirect } = useAuth0();

const loginWithBcc = async () => {
    // Set the used connection so we can use it again when trying to reauthenticate
    localStorage.setItem("usedAuth0Connection", "bcc-login");

    await loginWithRedirect({
        authorizationParams: {
            connection: "bcc-login",
            redirect_uri: window.location.origin,
        },
    });
};

const loginAsGuest = async () => {
    await loginWithRedirect({
        authorizationParams: {
            redirect_uri: window.location.origin,
        },
    });
};
</script>

<template>
    <div class="mx-auto max-w-lg">
        <LCard title="Log in">
            <div class="flex flex-col gap-5">
                <LButton
                    @click="loginWithBcc"
                    variant="bcc"
                    size="xl"
                    :icon="LLogo"
                    data-test="login-bcc"
                >
                    Log in with BCC
                </LButton>
                <LButton
                    @click="loginAsGuest"
                    variant="secondary"
                    size="xl"
                    data-test="login-guest"
                >
                    Log in as guest
                </LButton>
            </div>
        </LCard>
    </div>
</template>
