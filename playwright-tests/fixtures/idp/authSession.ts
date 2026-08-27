import type { BrowserContext } from "@playwright/test";
import type { TokenSet } from "./mint";

export type ClientTarget = "app" | "cms";

/**
 * The two clients persist the selected provider under different keys
 * (`app/src/authStorage.ts` and `cms/src/auth.ts`).
 */
export const ACTIVE_PROVIDER_KEY: Record<ClientTarget, string> = {
    app: "activeAuthProvider",
    cms: "cms_activeAuthProvider",
};

/** The subset of an AuthProvider doc that both clients persist and re-read. */
export type ProviderConfig = {
    _id: string;
    domain: string;
    clientId: string;
    audience: string;
};

export type SeedAuthSessionOptions = {
    target: ClientTarget;
    provider: ProviderConfig;
    tokens: TokenSet;
    profile?: Record<string, unknown>;
};

/**
 * `authority()` in both clients — the localStorage key oidc-client-ts derives is
 * built from it, so it has to be reproduced exactly.
 */
function authority(domain: string): string {
    const withScheme = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
    return withScheme.replace(/\/+$/, "");
}

/** `WebStorageStateStore`'s default `oidc.` prefix plus `UserManager._userStoreKey`. */
function userStoreKey(provider: ProviderConfig): string {
    return `oidc.user:${authority(provider.domain)}:${provider.clientId}`;
}

/**
 * Puts a signed session into the browser before any app code runs, so the client
 * boots straight into its authenticated path — `setupAuth()` reads the stored
 * user, sets the Authorization and `x-auth-provider-id` headers and authenticates
 * the socket, all against a token the API verifies for real. Skips the login UI
 * without faking anything the API relies on.
 */
export async function seedAuthSession(
    context: BrowserContext,
    { target, provider, tokens, profile }: SeedAuthSessionOptions,
): Promise<void> {
    const storedUser = {
        id_token: tokens.id_token,
        session_state: null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        scope: tokens.scope,
        profile: profile ?? {},
        expires_at: tokens.expires_at,
    };

    await context.addInitScript(
        ({ userKey, userValue, providerKey, providerValue }) => {
            // Init scripts re-run on every navigation; writing only when absent
            // keeps a token the app has since refreshed from being rolled back.
            if (!localStorage.getItem(userKey)) localStorage.setItem(userKey, userValue);
            if (!localStorage.getItem(providerKey))
                localStorage.setItem(providerKey, providerValue);
        },
        {
            userKey: userStoreKey(provider),
            userValue: JSON.stringify(storedUser),
            providerKey: ACTIVE_PROVIDER_KEY[target],
            providerValue: JSON.stringify(provider),
        },
    );
}

/** Drops any seeded session from an already-loaded page's origin. */
export async function clearAuthSession(
    context: BrowserContext,
    { target, provider }: { target: ClientTarget; provider: ProviderConfig },
): Promise<void> {
    const [page] = context.pages();
    if (!page) return;
    await page.evaluate(
        ({ userKey, providerKey }) => {
            localStorage.removeItem(userKey);
            localStorage.removeItem(providerKey);
        },
        { userKey: userStoreKey(provider), providerKey: ACTIVE_PROVIDER_KEY[target] },
    );
}
