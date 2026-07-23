import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "vue";
import type { Router } from "vue-router";
import { DocType, type AuthProviderDto } from "luminary-shared";
import * as Sentry from "@sentry/vue";

const {
    mockUserManager,
    mockWebStorageStateStore,
    mockGetUser,
    mockSigninSilent,
    mockSigninRedirect,
    mockSigninRedirectCallback,
    mockSignoutRedirect,
    mockClearStaleState,
    mockAddUserLoaded,
    mockAddUserUnloaded,
} = vi.hoisted(() => ({
    mockUserManager: vi.fn(),
    mockWebStorageStateStore: vi.fn(),
    mockGetUser: vi.fn(),
    mockSigninSilent: vi.fn(),
    mockSigninRedirect: vi.fn(),
    mockSigninRedirectCallback: vi.fn(),
    mockSignoutRedirect: vi.fn(),
    mockClearStaleState: vi.fn(),
    mockAddUserLoaded: vi.fn(),
    mockAddUserUnloaded: vi.fn(),
}));

vi.mock("oidc-client-ts", () => ({
    UserManager: mockUserManager,
    WebStorageStateStore: mockWebStorageStateStore,
}));

vi.mock("@sentry/vue", () => ({
    captureException: vi.fn(),
}));

import {
    ACTIVE_PROVIDER_KEY,
    activeProviderId,
    clearAuth0Cache,
    isAuthPluginInstalled,
    loginWithProvider,
    openProviderModal,
    persistActiveProvider,
    readPersistedProvider,
    refreshTokenSilently,
    resolveActiveProvider,
    setupAuth,
    showProviderSelectionModal,
    useAuth,
} from "./auth";

const providerA: AuthProviderDto = {
    _id: "provider-a",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Acme",
    domain: "acme.auth0.com",
    clientId: "client-a",
    audience: "https://api.acme.com",
};

const providerB: AuthProviderDto = {
    _id: "provider-b",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Beta",
    domain: "https://beta.example.com/",
    clientId: "client-b",
    audience: "https://api.beta.com",
};

function installManagerMock(): void {
    mockUserManager.mockImplementation(() => ({
        events: {
            addUserLoaded: mockAddUserLoaded,
            addUserUnloaded: mockAddUserUnloaded,
        },
        getUser: mockGetUser,
        signinSilent: mockSigninSilent,
        signinRedirect: mockSigninRedirect,
        signinRedirectCallback: mockSigninRedirectCallback,
        signoutRedirect: mockSignoutRedirect,
        clearStaleState: mockClearStaleState,
    }));
}

function resetWorld(): void {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, "", "/");
    clearAuth0Cache();
    showProviderSelectionModal.value = false;

    for (const mock of [
        mockUserManager,
        mockWebStorageStateStore,
        mockGetUser,
        mockSigninSilent,
        mockSigninRedirect,
        mockSigninRedirectCallback,
        mockSignoutRedirect,
        mockClearStaleState,
        mockAddUserLoaded,
        mockAddUserUnloaded,
    ])
        mock.mockReset();
    installManagerMock();
}

describe("auth", () => {
    beforeEach(resetWorld);
    afterEach(resetWorld);

    describe("resolveActiveProvider", () => {
        it("returns null when no OIDC provider configuration is persisted", async () => {
            expect(await resolveActiveProvider()).toBeNull();
        });

        it("restores the complete persisted provider without depending on an IdP cache key", async () => {
            persistActiveProvider(providerA);

            expect(await resolveActiveProvider()).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
                clientId: providerA.clientId,
                audience: providerA.audience,
            });
        });

        it("does not infer a provider from legacy Auth0 cache keys", async () => {
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile`,
                "{}",
            );
            sessionStorage.setItem(`a0.spajs.txs.${providerA.clientId}`, "{}");

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("clears an incomplete pre-OIDC provider record", async () => {
            localStorage.setItem(
                ACTIVE_PROVIDER_KEY,
                JSON.stringify({ _id: providerA._id, domain: providerA.domain }),
            );
            localStorage.setItem("oidc.user:https://issuer:client-a", "old-user");
            sessionStorage.setItem("oidc.pending", "old-state");

            expect(await resolveActiveProvider()).toBeNull();
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).toBeNull();
            expect(localStorage.getItem("oidc.user:https://issuer:client-a")).toBeNull();
            expect(sessionStorage.getItem("oidc.pending")).toBeNull();
        });

        it("returns null for corrupt persisted JSON", async () => {
            localStorage.setItem(ACTIVE_PROVIDER_KEY, "{not valid json");

            expect(await resolveActiveProvider()).toBeNull();
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).toBeNull();
        });
    });

    describe("persistActiveProvider / readPersistedProvider", () => {
        it("round-trips complete non-secret OIDC client configuration", () => {
            persistActiveProvider(providerA);

            expect(readPersistedProvider()).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
                clientId: providerA.clientId,
                audience: providerA.audience,
            });
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).not.toContain("access_token");
        });

        it("returns null when a required client setting is missing", () => {
            localStorage.setItem(
                ACTIVE_PROVIDER_KEY,
                JSON.stringify({ _id: "x", domain: "issuer", clientId: "c" }),
            );

            expect(readPersistedProvider()).toBeNull();
        });
    });

    describe("loginWithProvider", () => {
        it("persists the provider and starts a PKCE redirect with a generic OIDC manager", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);

            await loginWithProvider(providerB, { prompt: "login" });

            expect(readPersistedProvider()?._id).toBe(providerB._id);
            expect(activeProviderId.value).toBe(providerB._id);
            expect(isAuthPluginInstalled.value).toBe(true);
            expect(mockUserManager).toHaveBeenCalledWith(
                expect.objectContaining({
                    authority: "https://beta.example.com",
                    client_id: providerB.clientId,
                    response_type: "code",
                    scope: "openid profile email offline_access",
                    extraQueryParams: { audience: providerB.audience },
                }),
            );
            expect(mockWebStorageStateStore).toHaveBeenCalledWith({ store: window.localStorage });
            expect(mockClearStaleState).toHaveBeenCalledTimes(1);
            expect(mockSigninRedirect).toHaveBeenCalledWith({
                extraQueryParams: { prompt: "login" },
            });
            expect(mockAddUserLoaded).toHaveBeenCalledTimes(1);
            expect(mockAddUserUnloaded).toHaveBeenCalledTimes(1);
        });

        it("does not add an empty prompt parameter", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);

            await loginWithProvider(providerA);

            expect(mockSigninRedirect).toHaveBeenCalledWith({ extraQueryParams: undefined });
        });
    });

    describe("refreshTokenSilently", () => {
        const user = { access_token: "cached-token", expired: false, profile: { sub: "user-1" } };

        beforeEach(async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            await loginWithProvider(providerA);
            mockGetUser.mockReset();
            mockSigninSilent.mockReset();
        });

        it("uses the existing unexpired user on the normal boot path", async () => {
            mockGetUser.mockResolvedValue(user);

            await expect(refreshTokenSilently()).resolves.toBe(true);
            expect(mockGetUser).toHaveBeenCalledTimes(1);
            expect(mockSigninSilent).not.toHaveBeenCalled();
        });

        it("uses signinSilent after a server rejection so an old token cannot be replayed", async () => {
            const freshUser = {
                access_token: "fresh-token",
                expired: false,
                profile: { sub: "user-1" },
            };
            mockSigninSilent.mockResolvedValue(freshUser);

            await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(true);
            expect(mockGetUser).not.toHaveBeenCalled();
            expect(mockSigninSilent).toHaveBeenCalledTimes(1);
        });

        it("refreshes when the stored user is expired", async () => {
            mockGetUser.mockResolvedValue({ access_token: "expired-token", expired: true });
            mockSigninSilent.mockResolvedValue(user);

            await expect(refreshTokenSilently()).resolves.toBe(true);
            expect(mockSigninSilent).toHaveBeenCalledTimes(1);
        });

        it("returns false when silent refresh rejects", async () => {
            mockSigninSilent.mockRejectedValue(new Error("invalid_grant"));

            await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(false);
        });

        it("returns false when no access token is returned", async () => {
            mockSigninSilent.mockResolvedValue({ expired: false });

            await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(false);
        });
    });

    describe("setupAuth", () => {
        const appStub = {} as App<Element>;
        const routerStub = {
            replace: vi.fn(() => Promise.resolve(undefined)),
        } as unknown as Router;
        const user = { access_token: "boot-token", expired: false, profile: { sub: "user-1" } };

        beforeEach(() => {
            vi.mocked(routerStub.replace).mockClear();
        });

        it("installs the persisted provider and restores an existing user", async () => {
            persistActiveProvider(providerA);
            mockGetUser.mockResolvedValue(user);

            await setupAuth(appStub, routerStub);

            expect(mockUserManager).toHaveBeenCalledTimes(1);
            expect(activeProviderId.value).toBe(providerA._id);
            expect(mockGetUser).toHaveBeenCalledTimes(2);
            expect(mockSigninSilent).not.toHaveBeenCalled();
        });

        it("finishes an authorization-code callback and removes its query parameters", async () => {
            persistActiveProvider(providerA);
            history.replaceState(null, "", "/callback?code=abc&state=xyz#section");
            mockSigninRedirectCallback.mockResolvedValue(user);

            await setupAuth(appStub, routerStub);

            expect(mockSigninRedirectCallback).toHaveBeenCalledTimes(1);
            expect(routerStub.replace).toHaveBeenCalledWith("/callback#section");
            expect(mockGetUser).not.toHaveBeenCalled();
        });

        it("reports OIDC boot failures without throwing", async () => {
            persistActiveProvider(providerA);
            const error = new Error("invalid callback");
            mockGetUser.mockRejectedValue(error);

            await expect(setupAuth(appStub, routerStub)).resolves.toBeUndefined();
            expect(Sentry.captureException).toHaveBeenCalledWith(error);
        });

        it("does nothing when no provider has been selected", async () => {
            await setupAuth(appStub, routerStub);

            expect(mockUserManager).not.toHaveBeenCalled();
            expect(activeProviderId.value).toBeNull();
        });
    });

    describe("useAuth", () => {
        it("delegates explicit login and logout to the installed OIDC manager", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            mockSignoutRedirect.mockResolvedValue(undefined);
            await loginWithProvider(providerA);
            mockSigninRedirect.mockClear();

            const auth = useAuth();
            await auth.loginWithRedirect();
            await auth.logout();

            expect(mockSigninRedirect).toHaveBeenCalledTimes(1);
            expect(mockSignoutRedirect).toHaveBeenCalledTimes(1);
        });
    });

    describe("clearAuth0Cache", () => {
        it("clears OIDC state, legacy Auth0 state, headers, and provider selection", () => {
            localStorage.setItem("oidc.user:https://issuer:client", "user");
            sessionStorage.setItem("oidc.pending", "state");
            localStorage.setItem("@@auth0spajs@@::client::aud::scope", "legacy-user");
            sessionStorage.setItem("a0.spajs.txs.client", "legacy-state");
            localStorage.setItem("unrelated", "keep");
            sessionStorage.setItem("unrelated", "keep");
            persistActiveProvider(providerA);
            activeProviderId.value = providerA._id;

            clearAuth0Cache();

            expect(activeProviderId.value).toBeNull();
            expect(isAuthPluginInstalled.value).toBe(false);
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).toBeNull();
            expect(localStorage.getItem("oidc.user:https://issuer:client")).toBeNull();
            expect(sessionStorage.getItem("oidc.pending")).toBeNull();
            expect(localStorage.getItem("@@auth0spajs@@::client::aud::scope")).toBeNull();
            expect(sessionStorage.getItem("a0.spajs.txs.client")).toBeNull();
            expect(localStorage.getItem("unrelated")).toBe("keep");
            expect(sessionStorage.getItem("unrelated")).toBe("keep");
        });

        it("removes the installed manager so a later refresh is safe", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            await loginWithProvider(providerA);
            clearAuth0Cache();

            await expect(refreshTokenSilently()).resolves.toBe(false);
        });
    });

    it("opens the provider selection modal", () => {
        openProviderModal();

        expect(showProviderSelectionModal.value).toBe(true);
    });
});
