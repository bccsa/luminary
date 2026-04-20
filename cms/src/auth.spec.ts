import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, DocType, type AuthProviderDto } from "luminary-shared";

import {
    activeProviderId,
    clearAuth0Cache,
    openProviderModal,
    refreshTokenSilently,
    resolveActiveProvider,
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
});
