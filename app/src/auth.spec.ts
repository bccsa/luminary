import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, DocType, setCustomHeader, type AuthProviderDto } from "luminary-shared";
import type { App } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";

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

vi.mock("@sentry/vue", () => ({
    captureMessage: vi.fn(),
    captureException: vi.fn(),
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

    // Regression coverage for issue #1606 — "App: potential iPhone auth
    // IndexedDB race condition". The pre-existing setupAuth cold-start
    // branch called clearAuth0Cache() whenever resolveActiveProvider() came
    // up empty, which conflates "Dexie doesn't have a matching provider doc
    // right now" with "the user has no session intended." On iOS Safari we
    // suspect IDB can be evicted while localStorage survives, which would
    // make this defensive wipe destroy a valid session on every cold open.
    // The hypothesis is unconfirmed in the field; the minimum-impact fix is
    // to stop wiping the cache here (the server's provider_not_found
    // connect_error path still cleans it up if the provider really is gone)
    // and to send a Sentry message tagged with the orphan clientId so we
    // can verify whether this state actually occurs in production.
    describe("setupAuth — orphan Auth0 cache handling (issue #1606)", () => {
        const appStub = { use: () => {} } as unknown as App<Element>;
        const routerStub = { replace: () => Promise.resolve(undefined) } as unknown as Router;
        const cacheKeyFor = (p: AuthProviderDto) =>
            `@@auth0spajs@@::${p.clientId}::${p.audience}::openid profile email offline_access`;

        beforeEach(() => {
            mockGetAccessTokenSilently.mockReset();
            mockHandleRedirectCallback.mockReset();
            mockCreateAuth0.mockReset();
            mockCreateAuth0.mockImplementation(() => ({
                getAccessTokenSilently: mockGetAccessTokenSilently,
                handleRedirectCallback: mockHandleRedirectCallback,
                install: () => {},
            }));
            vi.mocked(Sentry.captureMessage).mockClear();
        });

        afterEach(() => {
            setCustomHeader("Authorization", "");
        });

        it("leaves an orphan Auth0 cache key in place and reports it to Sentry", async () => {
            // The suspect state: Auth0 session cached in localStorage, but
            // no matching AuthProvider doc in Dexie. Previously setupAuth
            // would wipe the cache here; now it must leave it alone and
            // surface the state so we can confirm whether the iOS-eviction
            // hypothesis is actually happening.
            const cacheKey = cacheKeyFor(providerA);
            const cacheValue = JSON.stringify({ body: {} });
            localStorage.setItem(cacheKey, cacheValue);

            await setupAuth(appStub, routerStub);

            // Cache untouched — the whole point of the change.
            expect(localStorage.getItem(cacheKey)).toBe(cacheValue);
            // No Auth0 plugin install (we still don't know which provider
            // this is), and no provider id header set.
            expect(mockCreateAuth0).not.toHaveBeenCalled();
            expect(activeProviderId.value).toBeNull();
            // Sentry was told about the orphan, tagged so we can filter.
            expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
            const [msg, ctx] = vi.mocked(Sentry.captureMessage).mock.calls[0];
            expect(msg).toContain("Auth0 cache key present but no matching AuthProvider doc");
            expect((ctx as { extra?: { clientId?: string } }).extra?.clientId).toBe(
                providerA.clientId,
            );
            expect((ctx as { tags?: { issue?: string } }).tags?.issue).toBe("1606");
        });

        it("does not report or touch storage on a true cold start (no Auth0 cache at all)", async () => {
            await setupAuth(appStub, routerStub);

            expect(mockCreateAuth0).not.toHaveBeenCalled();
            expect(Sentry.captureMessage).not.toHaveBeenCalled();
            expect(activeProviderId.value).toBeNull();
        });

        it("happy path: when the provider doc is in Dexie, installs Auth0 and does NOT report", async () => {
            await db.docs.bulkPut([providerA]);
            localStorage.setItem(cacheKeyFor(providerA), JSON.stringify({ body: {} }));
            mockGetAccessTokenSilently.mockResolvedValue("boot-token");

            await setupAuth(appStub, routerStub);

            expect(mockCreateAuth0).toHaveBeenCalledTimes(1);
            expect(activeProviderId.value).toBe(providerA._id);
            expect(Sentry.captureMessage).not.toHaveBeenCalled();
        });
    });
});
