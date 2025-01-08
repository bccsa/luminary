<script setup lang="ts">
import { appLanguageIdAsRef, userPreferencesAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { ShieldCheckIcon } from "@heroicons/vue/24/outline";
import { db, useDexieLiveQuery, type ContentDto } from "luminary-shared";
import { computed, watch } from "vue";
import LModal from "@/components/form/LModal.vue";
import LButton from "@/components/button/LButton.vue";

const show = defineModel<boolean>("show");

// Set the privacy policy status to "updated" if the policy has changed and the user previously accepted it
const privacyPolicy = useDexieLiveQuery(
    () =>
        db.docs
            .where({
                parentId: import.meta.env.VITE_PRIVACY_POLICY_ID,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (content.language == appLanguageIdAsRef.value) return true;

                return false;
            })
            .first() as unknown as ContentDto | undefined,
);

const modalMessageMap = {
    accepted: "You have already accepted the privacy policy.",
    declined:
        "You have previously declined the privacy policy. Please accept it for a fully featured app experience.",
    outdated:
        "We have updated our privacy policy. Please accept it for a fully featured app experience.",
    unaccepted: "Please accept our privacy policy for a fully featured app experience.",
};

const bannerMessageMap = {
    ...modalMessageMap,
    outdated:
        "We have updated our privacy policy. Click here to accept it for a fully featured app experience.",
    unaccepted: "Click here to accept our privacy policy for a fully featured app experience.",
};

const status = computed(() => {
    if (!userPreferencesAsRef.value.privacyPolicy) return "unaccepted";
    if (userPreferencesAsRef.value.privacyPolicy.status == "declined") return "declined";
    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";

    if (
        privacyPolicy.value &&
        privacyPolicy.value.publishDate &&
        userPreferencesAsRef.value.privacyPolicy.status == "accepted" &&
        privacyPolicy.value.publishDate > userPreferencesAsRef.value.privacyPolicy.ts
    )
        return "outdated";
    return "accepted";
});

// Wait 3 seconds before showing the privacy policy banner
setTimeout(() => {
    watch(
        status,
        (status) => {
            if (status != "accepted" && status != "declined") {
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner",
                    type: "banner",
                    state: "info",
                    title: "Privacy Policy",
                    description: bannerMessageMap[status],
                    icon: ShieldCheckIcon,
                    link: () => (show.value = true),
                    closable: false,
                });
                return;
            }

            useNotificationStore().removeNotification("privacy-policy-banner");
        },
        { immediate: true },
    );
}, 3000);
</script>

<template>
    <LModal :isVisible="show || false" heading="Privacy Policy" @close="show = false">
        <p class="mb-4 mt-4 text-gray-700 dark:text-slate-300">
            {{ modalMessageMap[status] }}
        </p>
        <p class="mb-8 italic text-gray-700 dark:text-slate-300">
            Click
            <RouterLink
                :to="{ name: 'content', params: { slug: 'privacy-policy' } }"
                class="text-blue-600 underline dark:text-yellow-400"
                @click="show = false"
                >here</RouterLink
            >
            to read our privacy policy.
        </p>

        <template #footer>
            <div class="flex justify-end space-x-2">
                <LButton
                    v-if="status != 'accepted'"
                    variant="primary"
                    name="accept"
                    @click="
                        userPreferencesAsRef.privacyPolicy = { status: 'accepted', ts: Date.now() };
                        show = false;
                    "
                    >Accept
                </LButton>
                <LButton
                    v-if="status == 'accepted'"
                    variant="primary"
                    name="close"
                    @click="show = false"
                    >Close</LButton
                >
                <LButton
                    variant="secondary"
                    name="decline"
                    @click="
                        userPreferencesAsRef.privacyPolicy = { status: 'declined', ts: Date.now() };
                        show = false;
                    "
                >
                    Decline
                </LButton>
            </div>
        </template>
    </LModal>
</template>
