import { computed } from "vue";
import { userPreferencesAsRef } from "@/globalConfig";
import { showPrivacyPolicyModal } from "@/composables/useAuthWithPrivacyPolicy";
import { useNotificationStore } from "@/stores/notification";

/**
 * Whether the app may interrupt the user with a prompt of its own, such as an update
 * reminder. The privacy notice comes first: nothing else asks for attention until it has
 * been answered, nor while it asks again because a newer policy was published.
 */
export function useCanPrompt() {
    const notificationStore = useNotificationStore();

    return computed(
        () =>
            !!userPreferencesAsRef.value.privacyPolicy?.status &&
            !showPrivacyPolicyModal.value &&
            // Raised by PrivacyPolicyModal while the notice is unanswered or outdated.
            !notificationStore.notifications.some((n) => n.id === "privacy-policy-banner"),
    );
}
