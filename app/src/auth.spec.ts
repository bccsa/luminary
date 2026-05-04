import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, DocType, setCustomHeader, type AuthProviderDto } from "luminary-shared";
import type { App } from "vue";

// Hoisted spies the mocked createAuth0 closes over. We assert against these to
// verify what refreshTokenSilently passes to the Auth0 SDK.
const { mockGetAccessTokenSilently, mockHandleRedirectCallback, mockCreateAuth0 } = vi.hoisted(
    () => ({
        mockGetAccessTokenSilently: vi.fn(),
        mockHandleRedirectCallback: vi.fn(),
        mockCreateAuth0: vi.fn(),
    }),
);

vi.mock("@auth0/auth0-vue", () => ({
    createAuth0: mockCreateAuth0,
}));

import {
    activeProviderId,
    clearAuth0Cache,
    openProviderModal,
    refreshTokenSilently,
    resolveActiveProvider,
    setupAuth,
    showProviderSelectionModal,
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
    domain: "beta.auth0.com",
    clientId: "client-b",
    audience: "https://api.beta.com",
};

/** Put the browser into a clean deterministic state before each test. */
async function resetWorld() {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, "", "/");
    activeProviderId.value = null;
    showProviderSelectionModal.value = false;
    await db.docs.clear();
}

describe("auth", () => {
    beforeEach(resetWorld);
    afterEach(resetWorld);

    describe("resolveActiveProvider", () => {
        it("returns null when storage is empty", async () => {
            await db.docs.bulkPut([providerA]);
            expect(await resolveActiveProvider()).toBeNull();
        });

        it("resolves via the localStorage session cache (returning user)", async () => {
            await db.docs.bulkPut([providerA, providerB]);
            // Auth0 SDK cache key format: @@auth0spajs@@::<clientId>::<audience>::<scope>
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: { access_token: "fake" } }),
            );

            const resolved = await resolveActiveProvider();
            expect(resolved?._id).toBe(providerA._id);
        });

        it("returns null when a localStorage clientId has no matching provider in Dexie", async () => {
            // Dexie has only providerA, cache key references an unknown clientId.
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(
                `@@auth0spajs@@::unknown-client::aud::scope`,
                JSON.stringify({ body: {} }),
            );

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("does NOT trust a stale PKCE txs key when URL has no code/state (bug fix)", async () => {
            // Simulates an aborted login: user hit Back on the Auth0 page, the txs
            // key remains in sessionStorage, URL no longer has ?code=&state=.
            await db.docs.bulkPut([providerA]);
            sessionStorage.setItem(
                `a0.spajs.txs.${providerA.clientId}`,
                JSON.stringify({ state: "s", code_verifier: "v" }),
            );

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("trusts the PKCE txs key when we ARE on the OAuth callback URL", async () => {
            // Legitimate mid-callback state: URL has code+state, txs key present.
            await db.docs.bulkPut([providerA]);
            sessionStorage.setItem(
                `a0.spajs.txs.${providerA.clientId}`,
                JSON.stringify({ state: "s", code_verifier: "v" }),
            );
            history.replaceState(null, "", "/?code=abc&state=xyz");

            const resolved = await resolveActiveProvider();
            expect(resolved?._id).toBe(providerA._id);
        });

        it("prefers the localStorage session cache over the sessionStorage txs key", async () => {
            // User completed a login with A, then aborted an attempt to switch to B
            // (B's txs key is stale). Even on a callback URL we should pick A because
            // A has a confirmed completed session.
            await db.docs.bulkPut([providerA, providerB]);
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::aud::scope`,
                JSON.stringify({ body: {} }),
            );
            sessionStorage.setItem(
                `a0.spajs.txs.${providerB.clientId}`,
                JSON.stringify({ state: "s" }),
            );
            history.replaceState(null, "", "/?code=abc&state=xyz");

            const resolved = await resolveActiveProvider();
            expect(resolved?._id).toBe(providerA._id);
        });

        it("ignores malformed cache keys without a clientId segment", async () => {
            await db.docs.bulkPut([providerA]);
            localStorage.setItem("@@auth0spajs@@::", JSON.stringify({}));
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::aud::scope`,
                JSON.stringify({ body: {} }),
            );

            const resolved = await resolveActiveProvider();
            expect(resolved?._id).toBe(providerA._id);
        });
    });

    describe("clearAuth0Cache", () => {
        it("removes @@auth0spajs@@ keys from localStorage and a0.spajs. keys from sessionStorage", () => {
            localStorage.setItem("@@auth0spajs@@::c1::aud::scope", "x");
            localStorage.setItem("@@auth0spajs@@::c2::aud::scope", "y");
            sessionStorage.setItem("a0.spajs.txs.c1", "z");
            sessionStorage.setItem("a0.spajs.other", "w");

            clearAuth0Cache();

            expect(localStorage.getItem("@@auth0spajs@@::c1::aud::scope")).toBeNull();
            expect(localStorage.getItem("@@auth0spajs@@::c2::aud::scope")).toBeNull();
            expect(sessionStorage.getItem("a0.spajs.txs.c1")).toBeNull();
            expect(sessionStorage.getItem("a0.spajs.other")).toBeNull();
        });

        it("leaves unrelated storage keys untouched", () => {
            localStorage.setItem("unrelated-app-key", "keep");
            sessionStorage.setItem("some-other-session-key", "keep");
            localStorage.setItem("@@auth0spajs@@::c::a::s", "drop");

            clearAuth0Cache();

            expect(localStorage.getItem("unrelated-app-key")).toBe("keep");
            expect(sessionStorage.getItem("some-other-session-key")).toBe("keep");
            expect(localStorage.getItem("@@auth0spajs@@::c::a::s")).toBeNull();
        });

        it("resets activeProviderId to null", () => {
            activeProviderId.value = "provider-a";
            clearAuth0Cache();
            expect(activeProviderId.value).toBeNull();
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
        it("returns false when no Auth0 plugin has been installed yet", async () => {
            // setupAuth hasn't run in this test context, so the module has no
            // oauth handle. The socket connect_error handler relies on this
            // being a safe `false` rather than a throw.
            expect(await refreshTokenSilently()).toBe(false);
        });
    });

    // Regression coverage for issue #1581 — "App: token not being refreshed
    // after expiration". The bug: refreshTokenSilently called
    // getAccessTokenSilently() with the SDK default `cacheMode: "on"`, so when
    // the server fires connect_error: auth_failed the SDK happily returned the
    // SAME server-rejected access token (any token still inside the SDK's 60s
    // leeway looks valid to the cache check). The connect_error handler would
    // loop with an unrejectable token and fall through to a visible re-login.
    // Fix: connect_error handlers now pass `{ ignoreCache: true }`, which
    // forwards `cacheMode: "off"` to the SDK so it must hit /oauth/token via
    // the refresh token. These tests pin that contract in place.
    describe("refreshTokenSilently — cache control (issue #1581 regression)", () => {
        const appStub = { use: () => {} } as unknown as App<Element>;
        const routerStub = { replace: () => Promise.resolve(undefined) } as unknown as Router;

        beforeEach(async () => {
            mockGetAccessTokenSilently.mockReset();
            mockHandleRedirectCallback.mockReset();
            mockCreateAuth0.mockReset();
            mockCreateAuth0.mockImplementation(() => ({
                getAccessTokenSilently: mockGetAccessTokenSilently,
                handleRedirectCallback: mockHandleRedirectCallback,
                install: () => {},
            }));

            // resolveActiveProvider needs both the Dexie doc AND a localStorage
            // cache key whose clientId segment matches.
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );

            // setupAuth's trailing refreshTokenSilently() consumes one resolution
            // before the actual test runs. Resolve it, then reset call history.
            mockGetAccessTokenSilently.mockResolvedValueOnce("boot-token");
            await setupAuth(appStub, routerStub);
            mockGetAccessTokenSilently.mockClear();
        });

        afterEach(() => {
            // The real Authorization header is set by refreshTokenSilently on
            // success — don't leak it into other tests.
            setCustomHeader("Authorization", "");
        });

        it("forwards cacheMode 'off' to getAccessTokenSilently when ignoreCache is true (regression: post-rejection refresh must skip the SDK cache)", async () => {
            mockGetAccessTokenSilently.mockResolvedValueOnce("fresh-token");

            const ok = await refreshTokenSilently({ ignoreCache: true });

            expect(ok).toBe(true);
            expect(mockGetAccessTokenSilently).toHaveBeenCalledTimes(1);
            expect(mockGetAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: "off" });
        });

        it("calls getAccessTokenSilently without options when ignoreCache is omitted (boot path keeps SDK cache enabled)", async () => {
            mockGetAccessTokenSilently.mockResolvedValueOnce("cached-token");

            const ok = await refreshTokenSilently();

            expect(ok).toBe(true);
            expect(mockGetAccessTokenSilently).toHaveBeenCalledTimes(1);
            expect(mockGetAccessTokenSilently).toHaveBeenCalledWith(undefined);
        });

        it("calls getAccessTokenSilently without options when ignoreCache is explicitly false", async () => {
            mockGetAccessTokenSilently.mockResolvedValueOnce("cached-token");

            const ok = await refreshTokenSilently({ ignoreCache: false });

            expect(ok).toBe(true);
            expect(mockGetAccessTokenSilently).toHaveBeenCalledWith(undefined);
        });

        it("regression: returns the FRESH token when Auth0 cache would replay the rejected one", async () => {
            // Simulates the production bug shape: the cache holds a token the
            // server has already rejected. A cacheMode='off' call must bypass
            // it; otherwise we'd loop on connect_error forever.
            const REJECTED = "expired-token-server-rejected";
            const FRESH = "fresh-token-from-refresh";
            mockGetAccessTokenSilently.mockImplementation(async (opts?: { cacheMode?: string }) =>
                opts?.cacheMode === "off" ? FRESH : REJECTED,
            );

            await refreshTokenSilently({ ignoreCache: true });

            // We can't read the in-memory custom-headers map from outside
            // luminary-shared, so assert via the spy: the SDK was asked for a
            // fresh token, not a cached one.
            expect(mockGetAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: "off" });
            const returnedTokens = await Promise.all(
                mockGetAccessTokenSilently.mock.results.map((r) => r.value),
            );
            expect(returnedTokens).toEqual([FRESH]);
        });

        it("returns false when getAccessTokenSilently rejects (e.g. invalid_grant) and does not throw", async () => {
            // Mirrors what happens when the refresh token itself is dead. The
            // connect_error handler treats `false` as a signal to show a
            // visible re-login.
            mockGetAccessTokenSilently.mockRejectedValueOnce(new Error("invalid refresh token"));

            await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(false);
        });

        it("returns false when getAccessTokenSilently resolves to an empty token", async () => {
            mockGetAccessTokenSilently.mockResolvedValueOnce("");

            const ok = await refreshTokenSilently({ ignoreCache: true });

            expect(ok).toBe(false);
        });

        it("each call asks the SDK independently — back-to-back retries from connect_error must each hit /oauth/token", async () => {
            // If the SDK is retried (e.g., another connect_error fires), we
            // must not collapse the second call into the first via stale cache.
            mockGetAccessTokenSilently
                .mockResolvedValueOnce("first-fresh")
                .mockResolvedValueOnce("second-fresh");

            await refreshTokenSilently({ ignoreCache: true });
            await refreshTokenSilently({ ignoreCache: true });

            expect(mockGetAccessTokenSilently).toHaveBeenCalledTimes(2);
            expect(mockGetAccessTokenSilently.mock.calls[0]).toEqual([{ cacheMode: "off" }]);
            expect(mockGetAccessTokenSilently.mock.calls[1]).toEqual([{ cacheMode: "off" }]);
        });
    });
});
