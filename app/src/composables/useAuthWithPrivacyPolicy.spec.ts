import {
    useAuthWithPrivacyPolicy,
    showPrivacyPolicyModal,
} from "@/composables/useAuthWithPrivacyPolicy";
import { useAuth0 } from "@auth0/auth0-vue";
import { userPreferencesAsRef } from "@/globalConfig";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import waitForExpect from "wait-for-expect";

// Mock Auth0
vi.mock("@auth0/auth0-vue", () => ({
    useAuth0: vi.fn(() => ({
        isAuthenticated: ref(false),
        user: ref(null),
        loginWithRedirect: vi.fn(),
        logout: vi.fn(),
    })),
}));

// Mock userPreferencesAsRef
vi.mock("@/globalConfig", () => ({
    userPreferencesAsRef: {
        value: {
            privacyPolicy: {
                status: "not_accepted",
            },
        },
    },
}));

describe("useAuthWithPrivacyPolicy", () => {
    let auth0Mock: ReturnType<typeof useAuth0>;
    let userPreferencesMock: { value: { privacyPolicy: { status: string } } };
    let loginWithRedirectMock: Mock;

    beforeEach(() => {
        loginWithRedirectMock = vi.fn();
        auth0Mock = {
            isAuthenticated: ref(false),
            user: ref(undefined),
            loginWithRedirect: loginWithRedirectMock,
            logout: vi.fn(),
            isLoading: ref(false),
            idTokenClaims: ref(undefined),
            error: ref(undefined),
            loginWithPopup: vi.fn(),
            getAccessTokenSilently: vi.fn(
                (
                    options?: any,
                ): Promise<string | { accessToken: string; claims: {}; headers: Headers }> => {
                    if (options?.detailedResponse) {
                        return Promise.resolve({
                            accessToken: "mocked-access-token",
                            claims: {},
                            headers: new Headers(),
                        });
                    } else {
                        return Promise.resolve("mocked-access-token");
                    }
                },
            ) as unknown as any,
            getAccessTokenWithPopup: vi.fn(),
            handleRedirectCallback: vi.fn(),
            checkSession: vi.fn(),
        };
        (useAuth0 as Mock).mockReturnValue(auth0Mock);

        userPreferencesMock = {
            value: {
                privacyPolicy: {
                    status: "not_accepted",
                },
            },
        };
        (userPreferencesAsRef as any).value = userPreferencesMock.value; // Necessary cast
        showPrivacyPolicyModal.value = false;
    });

    it("loginWithRedirect calls originalLoginWithRedirect when privacy policy is accepted", () => {
        userPreferencesMock.value.privacyPolicy.status = "accepted";
        (userPreferencesAsRef as any).value = userPreferencesMock.value;

        const { loginWithRedirect } = useAuthWithPrivacyPolicy();
        loginWithRedirect();
        expect(loginWithRedirectMock).toHaveBeenCalled();
        expect(showPrivacyPolicyModal.value).toBe(false);
    });

    it("loginWithRedirect shows modal when privacy policy is not accepted", () => {
        userPreferencesMock.value.privacyPolicy.status = "not_accepted";
        (userPreferencesAsRef as any).value = userPreferencesMock.value;

        const { loginWithRedirect } = useAuthWithPrivacyPolicy();
        loginWithRedirect();
        expect(loginWithRedirectMock).not.toHaveBeenCalled();
        expect(showPrivacyPolicyModal.value).toBe(true);
    });

    it("completePendingLogin calls originalLoginWithRedirect and closes modal when privacy policy is accepted", async () => {
        userPreferencesMock.value.privacyPolicy.status = "accepted";
        (userPreferencesAsRef as any).value = userPreferencesMock.value;
        const { loginWithRedirect, completePendingLogin } = useAuthWithPrivacyPolicy();
        loginWithRedirect();
        completePendingLogin();
        await waitForExpect(() => {
            expect(loginWithRedirectMock).toHaveBeenCalled();
            expect(showPrivacyPolicyModal.value).toBe(false);
        });
    });

    it("cancelPendingLogin clears pending login and closes modal", async () => {
        const { loginWithRedirect, cancelPendingLogin } = useAuthWithPrivacyPolicy();
        loginWithRedirect();
        cancelPendingLogin();

        await waitForExpect(async () => {
            expect(showPrivacyPolicyModal.value).toBe(false);
        });
    });

    it("isPrivacyPolicyAccepted returns true when privacy policy is accepted", async () => {
        userPreferencesMock.value.privacyPolicy.status = "accepted";
        (userPreferencesAsRef as any).value = userPreferencesMock.value;
        const { isPrivacyPolicyAccepted } = useAuthWithPrivacyPolicy();

        await waitForExpect(async () => {
            expect(isPrivacyPolicyAccepted.value).toBe(true);
        });
    });

    it("isPrivacyPolicyAccepted returns false when privacy policy is not accepted", async () => {
        userPreferencesMock.value.privacyPolicy.status = "not_accepted";
        (userPreferencesAsRef as any).value = userPreferencesMock.value;
        const { isPrivacyPolicyAccepted } = useAuthWithPrivacyPolicy();

        await waitForExpect(() => {
            expect(isPrivacyPolicyAccepted.value).toBe(false);
        });
    });
});
