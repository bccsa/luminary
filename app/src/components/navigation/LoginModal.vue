<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LModal from "@/components/form/LModal.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { isConnected } from "luminary-shared";
import { loginModalVisible } from "@/globalConfig";

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
    <LModal
        :isVisible="loginModalVisible || false"
        heading="Log in"
        class="mx-auto max-w-lg"
        @close="loginModalVisible = false"
    >
        <p class="my-4" v-if="!isConnected">
            You are offline. Please connect to the internet to log in.
        </p>

        <!-- <LCard v-else> -->
        <div class="flex flex-col gap-5" v-else>
            <LButton
                :disabled="!isConnected"
                @click="loginWithBcc"
                variant="bcc"
                size="xl"
                data-test="login-bcc"
            >
                Log in with BCC
            </LButton>
            <LButton
                @click="loginAsGuest"
                variant="secondary"
                :disabled="!isConnected"
                size="xl"
                data-test="login-guest"
            >
                Log in as guest
            </LButton>
        </div>
        <!-- </LCard> -->
    </LModal>
</template>
