import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { userPreferencesAsRef } from "@/globalConfig";
import { showPrivacyPolicyModal } from "@/composables/useAuthWithPrivacyPolicy";
import { useNotificationStore } from "@/stores/notification";
import { useCanPrompt } from "./useCanPrompt";

vi.mock("@/globalConfig", async () => {
    const { ref } = await import("vue");
    return {
        userPreferencesAsRef: ref<{ privacyPolicy?: { status: string; ts: number } }>({}),
    };
});

vi.mock("@/auth", () => ({
    currentReturnTo: vi.fn(),
    isAuthPluginInstalled: { value: false },
    openProviderModal: vi.fn(),
    useAuth: vi.fn(),
}));

describe("useCanPrompt", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        userPreferencesAsRef.value = { privacyPolicy: { status: "accepted", ts: 0 } } as never;
        showPrivacyPolicyModal.value = false;
    });

    it("allows prompts once the privacy notice has been answered", () => {
        expect(useCanPrompt().value).toBe(true);

        userPreferencesAsRef.value = { privacyPolicy: { status: "necessaryOnly", ts: 0 } } as never;
        expect(useCanPrompt().value).toBe(true);
    });

    it("holds prompts until the privacy notice has been answered", () => {
        userPreferencesAsRef.value = {} as never;
        expect(useCanPrompt().value).toBe(false);
    });

    it("holds prompts while the privacy modal is open", () => {
        showPrivacyPolicyModal.value = true;
        expect(useCanPrompt().value).toBe(false);
    });

    it("holds prompts while the privacy banner asks about a newer policy", () => {
        const canPrompt = useCanPrompt();
        useNotificationStore().notifications = [
            { id: "privacy-policy-banner", state: "info", type: "bottom" },
        ];
        expect(canPrompt.value).toBe(false);
    });
});
