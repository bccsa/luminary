import { ref } from "vue";

// Global state for privacy policy modal
const showPrivacyPolicyModal = ref(false);

export function usePrivacyPolicyModal() {
    return {
        showPrivacyPolicyModal,
        openPrivacyPolicyModal: () => {
            showPrivacyPolicyModal.value = true;
        },
        closePrivacyPolicyModal: () => {
            showPrivacyPolicyModal.value = false;
        },
    };
}
