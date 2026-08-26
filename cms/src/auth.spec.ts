import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// The token and the provider id it belongs to are only observable where they
// leave the module, so the shared socket is stubbed rather than connected.
const { mockSetAuth, mockReconnect, mockConnect, mockSetCustomHeader, mockRemoveCustomHeader } =
    vi.hoisted(() => ({
        mockSetAuth: vi.fn(),
        mockReconnect: vi.fn(),
        mockConnect: vi.fn(),
        mockSetCustomHeader: vi.fn(),
        mockRemoveCustomHeader: vi.fn(),
    }));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    const socketStub = {
        setAuth: mockSetAuth,
        reconnect: mockReconnect,
        connect: mockConnect,
        disconnect: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
    };
    // Proxy rather than a spread so the module's live bindings are preserved.
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "getSocket") return () => socketStub;
            if (prop === "setCustomHeader") return mockSetCustomHeader;
            if (prop === "removeCustomHeader") return mockRemoveCustomHeader;
            return Reflect.get(target, prop);
        },
    });
});

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
    isAuthenticated,
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
    user,
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
        mockSetAuth,
        mockReconnect,
        mockConnect,
        mockSetCustomHeader,
        mockRemoveCustomHeader,
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

        it("resolves to null without touching storage where localStorage does not exist", async () => {
            // auth.ts is importable from the Node prerender, which has no storage.
            vi.stubGlobal("localStorage", undefined);
            try {
                await expect(resolveActiveProvider()).resolves.toBeNull();
            } finally {
                vi.unstubAllGlobals();
            }
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

        it("survives a storage write that throws, since a redirect must still proceed", () => {
            const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
                throw new Error("QuotaExceededError");
            });
            try {
                expect(() => persistActiveProvider(providerA)).not.toThrow();
                expect(setItem).toHaveBeenCalled();
                expect(readPersistedProvider()).toBeNull();
            } finally {
                setItem.mockRestore();
            }
        });

        it("writes nothing where localStorage does not exist", () => {
            vi.stubGlobal("localStorage", undefined);
            try {
                expect(() => persistActiveProvider(providerA)).not.toThrow();
                expect(readPersistedProvider()).toBeNull();
            } finally {
                vi.unstubAllGlobals();
            }
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

        it("omits the audience parameter for a provider that does not set one", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);

            // A strict OIDC provider can reject `audience=` outright.
            await loginWithProvider({ ...providerA, audience: "" });

            expect(mockUserManager).toHaveBeenLastCalledWith(
                expect.objectContaining({ extraQueryParams: undefined }),
            );
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

        it("gives up on a token request that never settles, so the next caller isn't stuck", async () => {
            vi.useFakeTimers();
            try {
                mockSigninSilent.mockReturnValue(new Promise(() => {}));

                const hung = refreshTokenSilently({ ignoreCache: true });
                await vi.advanceTimersByTimeAsync(30_000);

                await expect(hung).resolves.toBe(false);

                // The single-flight slot is free again: a hung request must not
                // leave auth unrecoverable for every later caller.
                mockSigninSilent.mockResolvedValue(user);
                await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(true);
                expect(mockSigninSilent).toHaveBeenCalledTimes(2);
            } finally {
                vi.useRealTimers();
            }
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

            // Provider A's refresh lands after the switch. It must abandon its
            // result: pairing A's token with B's provider id is rejected by the
            // API outright, which reads to the user as a spontaneous logout.
            await expect(firstRefresh).resolves.toBe(false);
            await expect(secondRefresh).resolves.toBe(true);
            expect(mockSigninSilent).toHaveBeenCalledTimes(2);
            expect(activeProviderId.value).toBe(providerB._id);
            expect(mockSetAuth).toHaveBeenLastCalledWith("b-token", providerB._id);
            expect(mockSetAuth).not.toHaveBeenCalledWith("a-token", providerB._id);
        });

        it("keeps the current flight's slot when a superseded refresh settles late", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);

            let resolveA!: (user: unknown) => void;
            mockSigninSilent.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveA = resolve;
                    }),
            );
            const staleRefresh = refreshTokenSilently({ ignoreCache: true });

            await loginWithProvider(providerB);
            let resolveB!: (user: unknown) => void;
            mockSigninSilent.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveB = resolve;
                    }),
            );
            const currentRefresh = refreshTokenSilently({ ignoreCache: true });

            // Provider A's abandoned refresh settles first. Releasing the slot here
            // would let the next caller POST provider B's refresh token a second
            // time while B's own request is still open — rotation then invalidates
            // one of them and the user is signed out at random.
            resolveA({ access_token: "a-token", expired: false, profile: { sub: "user-a" } });
            await expect(staleRefresh).resolves.toBe(false);

            const joiner = refreshTokenSilently({ ignoreCache: true });
            resolveB({ access_token: "b-token", expired: false, profile: { sub: "user-b" } });

            await expect(currentRefresh).resolves.toBe(true);
            await expect(joiner).resolves.toBe(true);
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
        const user = { access_token: "boot-token", expired: false, profile: { sub: "user-1" } };

        it("installs the persisted provider and restores an existing user", async () => {
            persistActiveProvider(providerA);
            mockGetUser.mockResolvedValue(user);

            await setupAuth();

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

            await setupAuth();

            expect(mockSigninRedirectCallback).toHaveBeenCalledTimes(1);
            expect(location.pathname + location.hash).toBe("/callback#section");
            expect(location.search).toBe("");
            // refreshTokenSilently() must still run on the callback path.
            expect(mockGetUser).toHaveBeenCalledTimes(1);
            expect(mockSigninSilent).not.toHaveBeenCalled();
        });

        it("reports OIDC boot failures without throwing", async () => {
            persistActiveProvider(providerA);
            const error = new Error("invalid callback");
            mockGetUser.mockRejectedValue(error);

            await expect(setupAuth()).resolves.toBeUndefined();
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

            await setupAuth();

            expect(Sentry.captureException).toHaveBeenCalledWith(error);
            // Must still clean the URL — otherwise every later load retries and
            // fails the exact same way, forever.
            expect(location.pathname + location.hash).toBe("/callback#section");
            expect(location.search).toBe("");
            // Falls back to the already-established session instead of leaving
            // the user logged out.
            expect(mockGetUser).toHaveBeenCalled();
        });

        it("short-circuits with a mock token in auth-bypass mode", async () => {
            vi.resetModules();
            vi.stubEnv("VITE_AUTH_BYPASS", "true");
            try {
                const bypassed = await import("./auth");

                await bypassed.setupAuth();

                expect(mockSetCustomHeader).toHaveBeenCalledWith(
                    "Authorization",
                    "Bearer mock-token-for-e2e-testing",
                );
                expect(bypassed.isAuthPluginInstalled.value).toBe(true);
                expect(mockUserManager).not.toHaveBeenCalled();
            } finally {
                vi.unstubAllEnvs();
                vi.resetModules();
            }
        });

        it("does nothing when no provider has been selected", async () => {
            await setupAuth();

            expect(mockUserManager).not.toHaveBeenCalled();
            expect(activeProviderId.value).toBeNull();
        });

        it("strips an unredeemable code from the URL when no provider is selected", async () => {
            history.replaceState(null, "", "/callback?code=abc&state=xyz#section");

            await setupAuth();

            // Nothing is left that can redeem it, and leaving it in the URL keeps
            // an authorization code in history and outbound Referer headers.
            expect(mockUserManager).not.toHaveBeenCalled();
            expect(location.pathname + location.hash).toBe("/callback#section");
            expect(location.search).toBe("");
        });

        it("leaves a URL that carries no callback parameters untouched", async () => {
            history.replaceState(null, "", "/dashboard?tab=posts");

            await setupAuth();

            expect(location.pathname + location.search).toBe("/dashboard?tab=posts");
        });

        it("opens the provider modal when the token can't be refreshed and no callback was handled — the CMS has no unauthenticated state", async () => {
            persistActiveProvider(providerA);
            mockGetUser.mockResolvedValue(null);
            mockSigninSilent.mockRejectedValue(new Error("invalid_grant"));

            await setupAuth();

            expect(activeProviderId.value).toBeNull();
            expect(showProviderSelectionModal.value).toBe(true);
        });

        it("drops the provider id when a completed callback still can't be refreshed", async () => {
            persistActiveProvider(providerA);
            history.replaceState(null, "", "/callback?code=abc&state=xyz");
            mockSigninRedirectCallback.mockResolvedValue(user);
            mockGetUser.mockResolvedValue({ ...user, expired: true });
            mockSigninSilent.mockRejectedValue(new Error("invalid_grant"));

            await setupAuth();

            // main.ts connects anonymously while a provider id is set, and an
            // anonymous handshake replaces the accessMap and purges local data.
            expect(activeProviderId.value).toBeNull();
            // The callback did establish a session — don't prompt on top of it.
            expect(showProviderSelectionModal.value).toBe(false);
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

        it("carries id_token_hint captured before the cache is wiped", async () => {
            await loginWithProvider(providerA);
            const userLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];
            userLoaded?.({
                access_token: "a-token",
                id_token: "an-id-token",
                expired: false,
                profile: { sub: "user-a" },
            });

            await useAuth().logout();

            // clearAuthCache() wipes the user before the redirect is issued, so the
            // hint has to be read first or the provider gets a bare signout.
            expect(mockSignoutRedirect).toHaveBeenCalledWith({ id_token_hint: "an-id-token" });
        });

        it("is inert before a provider has been installed", async () => {
            const { loginWithRedirect, logout } = useAuth();

            await expect(logout()).resolves.toBeUndefined();
            expect(loginWithRedirect()).toBeUndefined();
            expect(mockSignoutRedirect).not.toHaveBeenCalled();
            expect(mockSigninRedirect).not.toHaveBeenCalled();
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

    describe("shared-device sign-out (forceReauthOnNextLogin)", () => {
        beforeEach(async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            mockSignoutRedirect.mockResolvedValue(undefined);
            await loginWithProvider(providerA);
        });

        it("forces prompt=login on the next unprompted login after a flagged logout", async () => {
            await useAuth().logout({ forceReauthOnNextLogin: true });

            mockSigninRedirect.mockClear();
            await loginWithProvider(providerB);

            expect(mockSigninRedirect).toHaveBeenCalledWith({
                extraQueryParams: { prompt: "login" },
            });
        });

        it("does not look for the flag where localStorage does not exist", async () => {
            vi.stubGlobal("localStorage", undefined);
            try {
                await loginWithProvider(providerA);

                expect(mockSigninRedirect).toHaveBeenLastCalledWith({
                    extraQueryParams: undefined,
                });
            } finally {
                vi.unstubAllGlobals();
            }
        });

        it("still signs out when the shared-device flag cannot be written", async () => {
            await loginWithProvider(providerA);
            const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
                throw new Error("QuotaExceededError");
            });
            try {
                await useAuth().logout({ forceReauthOnNextLogin: true });
            } finally {
                setItem.mockRestore();
            }

            // The flag is hardening; losing it must not strand the user signed in.
            expect(mockSignoutRedirect).toHaveBeenCalled();
        });

        it("does not force a prompt after a plain logout", async () => {
            await useAuth().logout();

            mockSigninRedirect.mockClear();
            await loginWithProvider(providerB);

            expect(mockSigninRedirect).toHaveBeenCalledWith({ extraQueryParams: undefined });
        });

        it("consumes the flag after one use", async () => {
            await useAuth().logout({ forceReauthOnNextLogin: true });
            await loginWithProvider(providerB);

            mockSigninRedirect.mockClear();
            await loginWithProvider(providerA);

            expect(mockSigninRedirect).toHaveBeenCalledWith({ extraQueryParams: undefined });
        });

        it("leaves the flag pending when the caller already requests an explicit prompt", async () => {
            await useAuth().logout({ forceReauthOnNextLogin: true });

            // Simulates a session-recovery call site (main.ts/router) that already
            // passes its own prompt — not the "next person logs in" path.
            await loginWithProvider(providerB, { prompt: "select_account" });
            expect(mockSigninRedirect).toHaveBeenLastCalledWith({
                extraQueryParams: { prompt: "select_account" },
            });

            mockSigninRedirect.mockClear();
            await loginWithProvider(providerA);

            expect(mockSigninRedirect).toHaveBeenCalledWith({
                extraQueryParams: { prompt: "login" },
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

        it("strips the socket's credentials so a later reconnect can't carry them", () => {
            clearAuthCache();

            expect(mockSetAuth).toHaveBeenCalledWith("", null);
            expect(mockRemoveCustomHeader).toHaveBeenCalledWith("Authorization");
            expect(mockRemoveCustomHeader).toHaveBeenCalledWith("x-auth-provider-id");
        });

        it("clears an abandoned login's PKCE state, which oidc-client-ts keeps in localStorage", () => {
            // oidc-client-ts stores signin state under `oidc.<state-id>` in
            // localStorage, next to the `oidc.user:` entry. Sweeping only the
            // user prefix leaves every abandoned login's code_verifier behind.
            localStorage.setItem("oidc.b8f3c1de9a", '{"code_verifier":"secret"}');

            clearAuthCache();

            expect(localStorage.getItem("oidc.b8f3c1de9a")).toBeNull();
        });

        it("completes even when removing the provider key throws", () => {
            const removeItem = vi
                .spyOn(localStorage, "removeItem")
                .mockImplementation((key: string) => {
                    if (key === ACTIVE_PROVIDER_KEY) throw new Error("SecurityError");
                });
            try {
                expect(() => clearAuthCache()).not.toThrow();
                expect(removeItem).toHaveBeenCalledWith(ACTIVE_PROVIDER_KEY);
                expect(activeProviderId.value).toBeNull();
            } finally {
                removeItem.mockRestore();
            }
        });

        it("removes the installed manager so a later refresh is safe", async () => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
            await loginWithProvider(providerA);
            clearAuthCache();

            await expect(refreshTokenSilently()).resolves.toBe(false);
        });
    });

    describe("provider identity", () => {
        beforeEach(() => {
            mockClearStaleState.mockResolvedValue(undefined);
            mockSigninRedirect.mockResolvedValue(undefined);
        });

        it("sends a token and the provider id it was issued for together", async () => {
            await loginWithProvider(providerA);
            mockGetUser.mockResolvedValue({
                access_token: "a-token",
                expired: false,
                profile: { sub: "user-a" },
            });

            await expect(refreshTokenSilently()).resolves.toBe(true);

            // The API rejects a token that arrives without its provider outright,
            // so the pair must never be split.
            expect(mockSetAuth).toHaveBeenLastCalledWith("a-token", providerA._id);
            expect(activeProviderId.value).toBe(providerA._id);
            // REST carries the same token as the socket handshake.
            expect(mockSetCustomHeader).toHaveBeenCalledWith("Authorization", "Bearer a-token");
            expect(mockSetCustomHeader).toHaveBeenCalledWith("x-auth-provider-id", providerA._id);
            // A fresh token is worthless until the rejected connection is retried.
            expect(mockReconnect).toHaveBeenCalled();
        });

        it("re-asserts the provider id when a failed sign-in cleared it", async () => {
            await loginWithProvider(providerA);
            // Mirrors the state left by a sign-in that installed a manager but
            // could not complete: the header is cleared, the manager stays.
            activeProviderId.value = null;
            mockGetUser.mockResolvedValue({
                access_token: "a-token",
                expired: false,
                profile: { sub: "user-a" },
            });

            await expect(refreshTokenSilently()).resolves.toBe(true);

            expect(mockSetAuth).toHaveBeenLastCalledWith("a-token", providerA._id);
            expect(mockSetAuth).not.toHaveBeenCalledWith("a-token", null);
            expect(activeProviderId.value).toBe(providerA._id);
            expect(mockSetCustomHeader).toHaveBeenCalledWith("x-auth-provider-id", providerA._id);
        });

        it("ignores user events from a manager the user has switched away from", async () => {
            await loginWithProvider(providerA);
            const providerAUserLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];
            await loginWithProvider(providerB);
            const providerBUserLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];

            providerBUserLoaded?.({
                access_token: "b-token",
                expired: false,
                profile: { sub: "user-b" },
            });
            // A late signinSilent on the abandoned provider still fires its
            // events; they must not overwrite the current session.
            providerAUserLoaded?.({
                access_token: "a-token",
                expired: false,
                profile: { sub: "user-a" },
            });

            expect(isAuthenticated.value).toBe(true);
            expect(user.value?.sub).toBe("user-b");
        });

        it("still clears the session when the current manager unloads its user", async () => {
            await loginWithProvider(providerA);
            const userLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];
            const userUnloaded = mockAddUserUnloaded.mock.calls.at(-1)?.[0];

            userLoaded?.({ access_token: "a-token", expired: false, profile: { sub: "user-a" } });
            expect(isAuthenticated.value).toBe(true);

            userUnloaded?.();

            expect(isAuthenticated.value).toBe(false);
        });

        it("ignores an unload from a manager the user has switched away from", async () => {
            await loginWithProvider(providerA);
            const providerAUserUnloaded = mockAddUserUnloaded.mock.calls.at(-1)?.[0];
            await loginWithProvider(providerB);
            const providerBUserLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];

            providerBUserLoaded?.({
                access_token: "b-token",
                expired: false,
                profile: { sub: "user-b" },
            });
            // The abandoned manager unloads its own user on teardown; that must
            // not sign out the provider the user actually switched to.
            providerAUserUnloaded?.();

            expect(isAuthenticated.value).toBe(true);
            expect(user.value?.sub).toBe("user-b");
        });

        it("makes a cleared manager's late user events inert", async () => {
            await loginWithProvider(providerA);
            const userLoaded = mockAddUserLoaded.mock.calls.at(-1)?.[0];

            clearAuthCache();
            // A signinSilent still in flight when the cache was cleared fires its
            // events regardless; it must not restore the session just left.
            userLoaded?.({ access_token: "a-token", expired: false, profile: { sub: "user-a" } });

            expect(isAuthenticated.value).toBe(false);
        });

        it("keeps an explicit scheme and strips repeated trailing slashes", async () => {
            await loginWithProvider({ ...providerA, domain: "https://acme.example.com//" });

            expect(mockUserManager).toHaveBeenLastCalledWith(
                expect.objectContaining({ authority: "https://acme.example.com" }),
            );
        });

        it("normalises a trailing slash out of a scheme-less provider domain", async () => {
            await loginWithProvider({ ...providerA, domain: "acme.auth0.com/" });

            // A trailing slash would yield `…com//.well-known/openid-configuration`.
            expect(mockUserManager).toHaveBeenLastCalledWith(
                expect.objectContaining({ authority: "https://acme.auth0.com" }),
            );
        });
    });

    it("opens the provider selection modal", () => {
        openProviderModal();

        expect(showProviderSelectionModal.value).toBe(true);
    });
});
