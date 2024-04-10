<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import BccLogo from "@/components/BccLogo.vue";
import { useAuth0 } from "@auth0/auth0-vue";

const { loginWithRedirect } = useAuth0();

const loginWithBcc = async () => {
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
                <LButton @click="loginWithBcc" variant="bcc" size="xl" :icon="BccLogo">
                    Log in with BCC
                </LButton>
                <LButton @click="loginAsGuest" variant="secondary" size="xl">
                    Log in as guest
                </LButton>
            </div>
        </LCard>
    </div>
</template>
