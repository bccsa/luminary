import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, DocType, setCustomHeader, type AuthProviderDto } from "luminary-shared";
import type { App } from "vue";

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
    ACTIVE_PROVIDER_KEY,
    activeProviderId,
    clearAuth0Cache,
    openProviderModal,
    persistActiveProvider,
    readPersistedProvider,
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
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: { access_token: "fake" } }),
            );

            const resolved = await resolveActiveProvider();
            expect(resolved?._id).toBe(providerA._id);
        });

        it("returns null when a localStorage clientId has no matching provider in Dexie", async () => {
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(
                `@@auth0spajs@@::unknown-client::aud::scope`,
                JSON.stringify({ body: {} }),
            );

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("does NOT trust a stale PKCE txs key when URL has no code/state (bug fix)", async () => {
            await db.docs.bulkPut([providerA]);
            sessionStorage.setItem(
                `a0.spajs.txs.${providerA.clientId}`,
                JSON.stringify({ state: "s", code_verifier: "v" }),
            );

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("trusts the PKCE txs key when we ARE on the OAuth callback URL", async () => {
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

        it("resolves from the persisted provider when Dexie has been evicted (issue #1671)", async () => {
            // The Auth0 refresh-token cache survives in localStorage but the
            // AuthProvider doc has been evicted from IndexedDB. _id + domain come
            // from the persisted blob; clientId + audience from the cache key —
            // no Dexie dependency.
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: { access_token: "fake" } }),
            );
            persistActiveProvider(providerA);
            // Dexie intentionally left empty.

            const resolved = await resolveActiveProvider();
            expect(resolved).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
                clientId: providerA.clientId,
                audience: providerA.audience,
            });
        });

        it("write-through: caches the resolved Dexie doc so it survives later eviction", async () => {
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).toBeNull();

            const first = await resolveActiveProvider();
            expect(first?._id).toBe(providerA._id);
            // The Dexie resolve wrote the config through to localStorage.
            expect(readPersistedProvider()?._id).toBe(providerA._id);

            // Now evict Dexie; resolution still works from the persisted copy.
            await db.docs.clear();
            const second = await resolveActiveProvider();
            expect(second?._id).toBe(providerA._id);
        });

        it("prefers the live Dexie doc over a stale persisted domain (Dexie-first)", async () => {
            // Persisted copy has a stale domain (e.g. the provider was migrated
            // to an Auth0 custom domain). The live Dexie doc is authoritative and
            // refreshes the persisted copy.
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            persistActiveProvider({ _id: providerA._id, domain: "stale.auth0.com" });

            const resolved = await resolveActiveProvider();
            expect(resolved?.domain).toBe(providerA.domain);
            expect(resolved?.audience).toBe(providerA.audience);
            expect(readPersistedProvider()?.domain).toBe(providerA.domain);
        });

        // Regression — the #1671 recovery must be purely additive: the
        // pre-existing Dexie path is unchanged, the realistic two-key Auth0
        // cache parses correctly, and the eviction fallback only fires with a
        // genuine persisted blob (no accidental recovery).
        it("Dexie-backed resolve is unchanged with the realistic two-key cache", async () => {
            // The real Auth0 SDK writes BOTH a standard token key and a sibling
            // id-token (::@@user@@) key. With the provider doc in Dexie this must
            // resolve the full config from Dexie, exactly as before.
            await db.docs.bulkPut([providerA, providerB]);
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::@@user@@`,
                JSON.stringify({ id_token: "fake", decodedToken: { claims: {} } }),
            );
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );

            expect(await resolveActiveProvider()).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
                clientId: providerA.clientId,
                audience: providerA.audience,
            });
        });

        it("on eviction, reads audience from the standard key and skips the id-token (::@@user@@) key", async () => {
            // Both keys present, Dexie evicted → clientId + audience come off the
            // standard key (never "@@user@@"), _id + domain from the blob.
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::@@user@@`,
                JSON.stringify({ id_token: "fake", decodedToken: { claims: {} } }),
            );
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );
            persistActiveProvider(providerA);

            expect(await resolveActiveProvider()).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
                clientId: providerA.clientId,
                audience: providerA.audience,
            });
        });

        it("does not recover when only the id-token (::@@user@@) key is present (no audience)", async () => {
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::@@user@@`,
                JSON.stringify({ id_token: "fake", decodedToken: { claims: {} } }),
            );
            persistActiveProvider(providerA);

            expect(await resolveActiveProvider()).toBeNull();
        });

        it("does not recover from the cache key alone without a persisted blob (opt-in)", async () => {
            // Pre-feature behaviour: a session cache with no Dexie doc and no
            // persisted blob still resolves to null — no accidental recovery.
            localStorage.setItem(
                `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`,
                JSON.stringify({ body: {} }),
            );

            expect(await resolveActiveProvider()).toBeNull();
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

        it("removes the persisted active provider (issue #1671)", () => {
            persistActiveProvider(providerA);
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).not.toBeNull();

            clearAuth0Cache();

            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).toBeNull();
        });
    });

    describe("persistActiveProvider / readPersistedProvider (issue #1671)", () => {
        it("round-trips _id and domain (and stores nothing else)", () => {
            persistActiveProvider(providerA);
            expect(readPersistedProvider()).toEqual({
                _id: providerA._id,
                domain: providerA.domain,
            });
            // clientId / audience are read from the cache key, never persisted.
            expect(localStorage.getItem(ACTIVE_PROVIDER_KEY)).not.toContain(providerA.clientId);
        });

        it("returns null when nothing is persisted", () => {
            expect(readPersistedProvider()).toBeNull();
        });

        it("returns null for corrupt JSON", () => {
            localStorage.setItem(ACTIVE_PROVIDER_KEY, "{not valid json");
            expect(readPersistedProvider()).toBeNull();
        });

        it("returns null when a required field is missing", () => {
            // Missing `domain` — buildAuth0Options would break without it.
            localStorage.setItem(
                ACTIVE_PROVIDER_KEY,
                JSON.stringify({ _id: "x", clientId: "c", audience: "a" }),
            );
            expect(readPersistedProvider()).toBeNull();
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
            // before the actual test runs. Resolve it, then reset call history
            // and the side-effects (CMS opens the provider modal on failure).
            mockGetAccessTokenSilently.mockResolvedValueOnce("boot-token");
            await setupAuth(appStub);
            mockGetAccessTokenSilently.mockClear();
            showProviderSelectionModal.value = false;
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

            expect(mockGetAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: "off" });
            const returnedTokens = await Promise.all(
                mockGetAccessTokenSilently.mock.results.map((r) => r.value),
            );
            expect(returnedTokens).toEqual([FRESH]);
        });

        it("returns false when getAccessTokenSilently rejects (e.g. invalid_grant) and does not throw", async () => {
            mockGetAccessTokenSilently.mockRejectedValueOnce(new Error("invalid refresh token"));

            await expect(refreshTokenSilently({ ignoreCache: true })).resolves.toBe(false);
        });

        it("returns false when getAccessTokenSilently resolves to an empty token", async () => {
            mockGetAccessTokenSilently.mockResolvedValueOnce("");

            const ok = await refreshTokenSilently({ ignoreCache: true });

            expect(ok).toBe(false);
        });

        it("each call asks the SDK independently — back-to-back retries from connect_error must each hit /oauth/token", async () => {
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

    // Issue #1671 — the CMS no-provider branch used to clearAuth0Cache(),
    // destroying a still-valid refresh token whenever Dexie had no matching
    // AuthProvider doc (e.g. IndexedDB evicted while localStorage survived).
    // It must now leave the cache intact; the router guard surfaces the
    // provider modal, and the server's provider_not_found path cleans up a
    // truly-deleted provider.
    describe("setupAuth — no-provider branch is non-destructive (issue #1671)", () => {
        const appStub = { use: () => {} } as unknown as App<Element>;

        beforeEach(() => {
            mockCreateAuth0.mockReset();
            mockCreateAuth0.mockImplementation(() => ({
                getAccessTokenSilently: mockGetAccessTokenSilently,
                handleRedirectCallback: mockHandleRedirectCallback,
                install: () => {},
            }));
        });

        it("leaves the Auth0 cache key in place and does not open the modal when no provider resolves", async () => {
            // Auth0 session cached in localStorage, but no AuthProvider doc in
            // Dexie and nothing persisted — the eviction shape.
            const cacheKey = `@@auth0spajs@@::${providerA.clientId}::${providerA.audience}::openid profile email offline_access`;
            const cacheValue = JSON.stringify({ body: { access_token: "fake" } });
            localStorage.setItem(cacheKey, cacheValue);

            await setupAuth(appStub);

            // Cache untouched — the whole point of the change.
            expect(localStorage.getItem(cacheKey)).toBe(cacheValue);
            // No Auth0 plugin installed (we don't know domain/_id), no header.
            expect(mockCreateAuth0).not.toHaveBeenCalled();
            expect(activeProviderId.value).toBeNull();
            // The modal is the router guard's job, not setupAuth's.
            expect(showProviderSelectionModal.value).toBe(false);
        });
    });
});
