import { ref } from "vue";

// Global state for privacy policy modal
export const showPrivacyPolicyModal = ref(false);

export function usePrivacyPolicyModal() {
    return {
        openPrivacyPolicyModal: () => {
            showPrivacyPolicyModal.value = true;
        },
        closePrivacyPolicyModal: () => {
            showPrivacyPolicyModal.value = false;
        },
    };
}
