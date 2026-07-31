import {
    useAuthWithPrivacyPolicy,
    showPrivacyPolicyModal,
    hasPendingLogin,
} from "@/composables/useAuthWithPrivacyPolicy";
import { userPreferencesAsRef } from "@/globalConfig";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import waitForExpect from "wait-for-expect";
import { isAuthPluginInstalled, openProviderModal, useAuth } from "@/auth";

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

// Mock @/auth so we can assert openProviderModal is called/skipped while still
// sharing the isAuthPluginInstalled ref between the composable and the tests.
vi.mock("@/auth", async () => {
    const { ref: mockRef } = await import("vue");
    return {
        isAuthPluginInstalled: mockRef(false),
        openProviderModal: vi.fn(),
        useAuth: vi.fn(() => ({
            isLoading: mockRef(false),
            isAuthenticated: mockRef(false),
            user: mockRef(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        })),
    };
});

describe("useAuthWithPrivacyPolicy", () => {
    let authMock: ReturnType<typeof useAuth>;
    let userPreferencesMock: { value: { privacyPolicy: { status: string } } };
    let loginWithRedirectMock: Mock;

    beforeEach(() => {
        loginWithRedirectMock = vi.fn();
        authMock = {
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: loginWithRedirectMock,
            logout: vi.fn(),
            isLoading: ref(false),
        } as unknown as ReturnType<typeof useAuth>;
        (useAuth as Mock).mockReturnValue(authMock);

        userPreferencesMock = {
            value: {
                privacyPolicy: {
                    status: "not_accepted",
                },
            },
        };
        (userPreferencesAsRef as any).value = userPreferencesMock.value; // Necessary cast
        showPrivacyPolicyModal.value = false;
        hasPendingLogin.value = false;
        // Tests mock useAuth; pretend the OIDC manager is installed so the
        // composable actually calls it instead of short-circuiting.
        isAuthPluginInstalled.value = true;
    });

    afterEach(() => {
        isAuthPluginInstalled.value = false;
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
        expect(hasPendingLogin.value).toBe(true);
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
            expect(hasPendingLogin.value).toBe(false);
        });
    });

    it("cancelPendingLogin clears pending login and closes modal", async () => {
        const { loginWithRedirect, cancelPendingLogin } = useAuthWithPrivacyPolicy();
        loginWithRedirect();
        cancelPendingLogin();

        await waitForExpect(async () => {
            expect(showPrivacyPolicyModal.value).toBe(false);
            expect(hasPendingLogin.value).toBe(false);
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

    it("returns fallback object when the OIDC manager is not installed", () => {
        isAuthPluginInstalled.value = false;

        const result = useAuthWithPrivacyPolicy();

        expect(result.isAuthenticated.value).toBe(false);
        expect(result.user.value).toBeNull();
        expect(result.logout).toBeInstanceOf(Function);
        expect(result.loginWithRedirect).toBeInstanceOf(Function);
        expect(result.completePendingLogin).toBeInstanceOf(Function);
        expect(result.cancelPendingLogin).toBeInstanceOf(Function);

        // Verify logout/cancel are no-ops (don't throw)
        result.logout();
        result.cancelPendingLogin();
    });

    describe("fallback path (OIDC manager not installed)", () => {
        beforeEach(() => {
            isAuthPluginInstalled.value = false;
            (openProviderModal as Mock).mockClear();
        });

        it("gates openProviderModal behind the privacy policy when not accepted", () => {
            userPreferencesMock.value.privacyPolicy.status = "not_accepted";
            (userPreferencesAsRef as any).value = userPreferencesMock.value;

            const { loginWithRedirect } = useAuthWithPrivacyPolicy();
            loginWithRedirect();

            expect(openProviderModal).not.toHaveBeenCalled();
            expect(showPrivacyPolicyModal.value).toBe(true);
            expect(hasPendingLogin.value).toBe(true);
        });

        it("calls openProviderModal immediately when privacy policy is accepted", () => {
            userPreferencesMock.value.privacyPolicy.status = "accepted";
            (userPreferencesAsRef as any).value = userPreferencesMock.value;

            const { loginWithRedirect } = useAuthWithPrivacyPolicy();
            loginWithRedirect();

            expect(openProviderModal).toHaveBeenCalledTimes(1);
            expect(showPrivacyPolicyModal.value).toBe(false);
            expect(hasPendingLogin.value).toBe(false);
        });

        it("runs pending openProviderModal after the policy is accepted", async () => {
            userPreferencesMock.value.privacyPolicy.status = "not_accepted";
            (userPreferencesAsRef as any).value = userPreferencesMock.value;

            const { loginWithRedirect, completePendingLogin } = useAuthWithPrivacyPolicy();
            loginWithRedirect();
            expect(openProviderModal).not.toHaveBeenCalled();

            userPreferencesMock.value.privacyPolicy.status = "accepted";
            (userPreferencesAsRef as any).value = userPreferencesMock.value;
            completePendingLogin();

            await waitForExpect(() => {
                expect(openProviderModal).toHaveBeenCalledTimes(1);
                expect(showPrivacyPolicyModal.value).toBe(false);
                expect(hasPendingLogin.value).toBe(false);
            });
        });

        it("does not call openProviderModal when a pending login is cancelled", () => {
            userPreferencesMock.value.privacyPolicy.status = "not_accepted";
            (userPreferencesAsRef as any).value = userPreferencesMock.value;

            const { loginWithRedirect, cancelPendingLogin } = useAuthWithPrivacyPolicy();
            loginWithRedirect();
            cancelPendingLogin();

            expect(openProviderModal).not.toHaveBeenCalled();
            expect(showPrivacyPolicyModal.value).toBe(false);
            expect(hasPendingLogin.value).toBe(false);
        });
    });
});
