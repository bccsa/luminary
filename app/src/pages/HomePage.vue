<script setup lang="ts">
import { ref } from "vue";
import { type ContentDto, DocType, db } from "luminary-shared";
import { useAuth0 } from "@auth0/auth0-vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HomePagePinned from "@/components/HomePage/HomePagePinned.vue";
import HomePageUnpinned from "@/components/HomePage/HomePageUnpinned.vue";
import HomePageNewest from "@/components/HomePage/HomePageNewest.vue";
import { useNotificationStore } from "@/stores/notification";
import LButton from "@/components/button/LButton.vue";

const { isAuthenticated } = useAuth0();

const notificationStore = useNotificationStore();
const userPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
const privatePolicyState = ref<boolean>(userPreferences.privatePolicyState || false);
const showModal = ref(false);

// Check if private policy is not accepted, then push notification
if (!privatePolicyState.value) {
    notificationStore.addNotification({
        type: "banner",
        state: "info",
        title: "Privacy Policy",
        description: "By using this app, you agree to our privacy policy.",
        routerLink: () => (showModal.value = true),
    });
}

// Function to accept privacy policy
const acceptPrivacyPolicy = () => {
    privatePolicyState.value = true;
    showModal.value = false;
    // Update localStorage with the new preference
    localStorage.setItem(
        "userPreferences",
        JSON.stringify({ ...userPreferences, privatePolicyState: true }),
    );
};

// Function to decline privacy policy
const declinePrivacyPolicy = () => {
    showModal.value = false;
};

const hasPosts = db.toRef<boolean>(
    () =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageIdAsRef.value,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .first()
            .then((c) => c != undefined),
    true,
);

const noContentMessageDelay = ref(false);
setTimeout(() => {
    noContentMessageDelay.value = true;
}, 3000);
</script>

<template>
    <div v-if="!hasPosts" class="text-zinc-800 dark:text-slate-100">
        <div v-if="isAuthenticated">
            <p>
                You don't have access to any content. If you believe this is an error, send your
                contact person a message.
            </p>
        </div>
        <div v-else>
            <div v-if="noContentMessageDelay">
                <p>There is currently no content available.</p>

                <p class="mt-1">
                    Please
                    <router-link
                        :to="{ name: 'login' }"
                        class="text-yellow-600 underline hover:text-yellow-500"
                        >log in </router-link
                    >if you have an account.
                </p>
            </div>
        </div>
    </div>
    <IgnorePagePadding v-else class="mb-4">
        <Suspense>
            <HomePageNewest />
        </Suspense>
        <Suspense>
            <HomePagePinned />
        </Suspense>
        <Suspense>
            <HomePageUnpinned />
        </Suspense>
    </IgnorePagePadding>

    <!-- Privacy Policy Modal that need to be replace by LModal (Dirk) -->
    <div
        v-if="showModal"
        class="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50"
    >
        <div class="w-full max-w-md rounded-md bg-white p-6 shadow-lg dark:bg-slate-700">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-slate-100">Privacy Policy</h2>
            <p class="mt-4 text-gray-700 dark:text-slate-300">
                By using this app, you agree to our
                <RouterLink
                    :to="{ name: 'content', params: { slug: 'privacy-policy' } }"
                    class="text-blue-600 hover:underline"
                    >privacy policy</RouterLink
                >. <br />Do you want to help us improve it by accepting it ?
            </p>
            <div class="mt-6 flex justify-end space-x-4">
                <LButton
                    @click="declinePrivacyPolicy"
                    class="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-500 dark:text-slate-200"
                >
                    Decline
                </LButton>
                <LButton
                    @click="acceptPrivacyPolicy"
                    class="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                    Accept
                </LButton>
            </div>
        </div>
    </div>
</template>
