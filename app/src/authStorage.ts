/**
 * Storage key prefixes/keys shared between `auth.ts` and the web/SSG pre-paint
 * gate (`vite.config.web.ts`'s injected inline script). Kept import-safe for
 * Node (no Vue/oidc-client-ts/Sentry) so the gate script — which must run
 * before any app JS module loads — can mirror `hasPersistedSession()`'s check
 * without pulling in the rest of `auth.ts`.
 */

/** Prefix of oidc-client-ts's own localStorage user cache keys. */
export const OIDC_USER_PREFIX = "oidc.user:";

/** Prefix of the legacy Auth0 SPA SDK's localStorage refresh-token cache keys. */
export const LEGACY_AUTH0_CACHE_PREFIX = "@@auth0spajs@@::";

/**
 * localStorage key holding the active provider's identity. Persisting it next
 * to the OIDC/legacy-Auth0 session cache lets resolveActiveProvider recover
 * `domain` + `_id` after IndexedDB is evicted but localStorage survives.
 */
export const ACTIVE_PROVIDER_KEY = "activeAuthProvider";
