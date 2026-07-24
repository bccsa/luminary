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
    clearAuthCache,
    hasPersistedSession,
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
import {
    LEGACY_AUTH0_CACHE_PREFIX,
    ACTIVE_PROVIDER_KEY as STORAGE_ACTIVE_PROVIDER_KEY,
} from "./authStorage";

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
    clearAuthCache();
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

    // hasPersistedSession backs useContentQuery's response-cache auth scoping
    // (fix for "flash of public content" on reload while logged in) — it must
    // stay a pure, synchronous localStorage peek, no Dexie/async work.
    describe("hasPersistedSession", () => {
        it("returns false on empty storage", () => {
            expect(hasPersistedSession()).toBe(false);
        });

        it("returns true from a persisted OIDC user cache key alone", () => {
            localStorage.setItem("oidc.user:https://issuer:client-a", "old-user");
            expect(hasPersistedSession()).toBe(true);
        });

        it("returns true from a legacy Auth0 session cache key alone", () => {
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            expect(hasPersistedSession()).toBe(true);
        });

        it("uses the shared storage constants", () => {
            expect(STORAGE_ACTIVE_PROVIDER_KEY).toBe(ACTIVE_PROVIDER_KEY);
            localStorage.setItem(
                `${LEGACY_AUTH0_CACHE_PREFIX}${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            expect(hasPersistedSession()).toBe(true);
        });

        it("returns true from the persisted-provider fallback alone (issue #1671 eviction case)", () => {
            persistActiveProvider(providerA);
            expect(hasPersistedSession()).toBe(true);
        });

        it("returns false after clearAuthCache wipes all signals", () => {
            localStorage.setItem("oidc.user:https://issuer:client-a", "old-user");
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            persistActiveProvider(providerA);
            clearAuthCache();
            expect(hasPersistedSession()).toBe(false);
        });
    });

    describe("openProviderModal", () => {
        it("flips showProviderSelectionModal to true", () => {
            expect(showProviderSelectionModal.value).toBe(false);
            openProviderModal();
            expect(showProviderSelectionModal.value).toBe(true);
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

        it("single-flights concurrent calls so a rotated refresh token isn't replayed", async () => {
            mockSigninSilent.mockResolvedValue({
                access_token: "fresh-token",
                expired: false,
                profile: { sub: "user-1" },
            });

            const [first, second] = await Promise.all([
                refreshTokenSilently({ ignoreCache: true }),
                refreshTokenSilently({ ignoreCache: true }),
            ]);

            expect(first).toBe(true);
            expect(second).toBe(true);
            expect(mockSigninSilent).toHaveBeenCalledTimes(1);
        });

        it("does not join an in-flight refresh started for a since-superseded manager", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);

            let resolveFirst!: (user: unknown) => void;
            mockSigninSilent.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirst = resolve;
                    }),
            );

            // Starts against provider A's manager and stays pending.
            const firstRefresh = refreshTokenSilently({ ignoreCache: true });

            // A provider switch installs a brand new manager before that settles.
            await loginWithProvider(providerB);

            mockSigninSilent.mockResolvedValueOnce({
                access_token: "b-token",
                expired: false,
                profile: { sub: "user-b" },
            });

            // A caller after the switch must start its own refresh rather than
            // join the stale in-flight one from provider A's manager.
            const secondRefresh = refreshTokenSilently({ ignoreCache: true });

            resolveFirst({ access_token: "a-token", expired: false, profile: { sub: "user-a" } });

            await expect(firstRefresh).resolves.toBe(true);
            await expect(secondRefresh).resolves.toBe(true);
            expect(mockSigninSilent).toHaveBeenCalledTimes(2);
        });

        it("does not resurrect a session if logout supersedes an in-flight refresh", async () => {
            let resolveSigninSilent!: (user: unknown) => void;
            mockSigninSilent.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveSigninSilent = resolve;
                    }),
            );

            const refreshPromise = refreshTokenSilently({ ignoreCache: true });

            // Logout happens while the refresh above is still in flight.
            clearAuthCache();

            resolveSigninSilent({
                access_token: "late-token",
                expired: false,
                profile: { sub: "user-1" },
            });

            await expect(refreshPromise).resolves.toBe(false);
            expect(activeProviderId.value).toBeNull();
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
            // The manager's own store now holds the just-completed sign-in.
            mockGetUser.mockResolvedValue(user);

            await setupAuth(appStub, routerStub);

            expect(mockSigninRedirectCallback).toHaveBeenCalledTimes(1);
            expect(routerStub.replace).toHaveBeenCalledWith("/callback#section");
            // refreshTokenSilently() must still run on the callback path.
            expect(mockGetUser).toHaveBeenCalledTimes(1);
            expect(mockSigninSilent).not.toHaveBeenCalled();
        });

        it("reports OIDC boot failures without throwing", async () => {
            persistActiveProvider(providerA);
            const error = new Error("invalid callback");
            mockGetUser.mockRejectedValue(error);

            await expect(setupAuth(appStub, routerStub)).resolves.toBeUndefined();
            expect(Sentry.captureException).toHaveBeenCalledWith(error);
        });

        it("still cleans up the URL and falls back to an existing session when the callback fails", async () => {
            // A refresh on the callback URL after it already succeeded once
            // retries the same, by-then-consumed code+state — oidc-client-ts
            // throws "No matching state found in storage" for this.
            persistActiveProvider(providerA);
            history.replaceState(null, "", "/callback?code=abc&state=xyz#section");
            const error = new Error("No matching state found in storage");
            mockSigninRedirectCallback.mockRejectedValue(error);
            mockGetUser.mockResolvedValue(user);

            await setupAuth(appStub, routerStub);

            expect(Sentry.captureException).toHaveBeenCalledWith(error);
            // Must still clean the URL — otherwise every later load retries and
            // fails the exact same way, forever.
            expect(routerStub.replace).toHaveBeenCalledWith("/callback#section");
            // Falls back to the already-established session instead of leaving
            // the user logged out.
            expect(mockGetUser).toHaveBeenCalled();
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

        it("reloads locally when the IdP signout redirect fails (e.g. no end_session_endpoint)", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            mockSignoutRedirect.mockRejectedValue(new Error("No end session endpoint"));
            await loginWithProvider(providerA);

            const originalLocation = window.location;
            const reload = vi.fn();
            Object.defineProperty(window, "location", {
                writable: true,
                value: { reload },
            });

            await useAuth().logout();

            expect(reload).toHaveBeenCalledTimes(1);

            Object.defineProperty(window, "location", {
                writable: true,
                value: originalLocation,
            });
        });
    });

    describe("clearAuthCache", () => {
        it("clears OIDC state, legacy Auth0 state, headers, and provider selection", () => {
            localStorage.setItem("oidc.user:https://issuer:client", "user");
            sessionStorage.setItem("oidc.pending", "state");
            localStorage.setItem("@@auth0spajs@@::client::aud::scope", "legacy-user");
            sessionStorage.setItem("a0.spajs.txs.client", "legacy-state");
            localStorage.setItem("unrelated", "keep");
            sessionStorage.setItem("unrelated", "keep");
            persistActiveProvider(providerA);
            activeProviderId.value = providerA._id;

            clearAuthCache();

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
            clearAuthCache();

            await expect(refreshTokenSilently()).resolves.toBe(false);
        });
    });

    it("opens the provider selection modal", () => {
        openProviderModal();

        expect(showProviderSelectionModal.value).toBe(true);
    });
});
