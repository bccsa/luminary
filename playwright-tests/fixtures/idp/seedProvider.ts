/**
 * Writes the AuthProvider and AutoGroupMappings docs the fake issuer needs
 * straight into CouchDB. These are environment wiring, not fixtures shipped with
 * the product, so they deliberately do not live in `api/src/db/seedingDocs/`.
 */

import { couchFetch, type CouchConfig } from "./couch";

export const E2E_DEFAULT_MAPPING_ID = "auto-group-mappings-e2e-default";

/**
 * A User doc owned by the E2E suite. Provider scoping stamps a user with the
 * first provider it signs in through, permanently, so the spec that exercises
 * that needs an identity no other spec signs in as.
 */
export const E2E_SCOPED_USER_ID = "user-e2e-provider-scope";
export const E2E_SCOPED_USER_EMAIL = "provider-scope@users.test";

/** Mirrors the groups `api/scripts/add-auth-provider.ts` assigns. */
const PROVIDER_MEMBER_OF = ["group-super-admins", "group-public-users"];

const DEFAULT_GROUPS = ["group-public-users"];

export type SeedProviderOptions = {
    couch: CouchConfig;
    /** Document id, so several providers can coexist. */
    providerId: string;
    label: string;
    /** The fake issuer's origin, scheme included — `http://127.0.0.1:8099`. */
    domain: string;
    audience: string;
    clientId: string;
    /** Order the provider appears in the login UI. */
    sortIndex?: number;
    /**
     * Extra claim-driven group assignments, for exercising AutoGroupMappings
     * beyond the plain default-groups case.
     */
    mappings?: Array<{
        groupIds: string[];
        conditions: Array<{
            type: "authenticated" | "claimEquals" | "claimIn";
            claimPath?: string;
            value?: string;
            values?: string[];
        }>;
    }>;
};

async function couchRequest(couch: CouchConfig, docPath: string, init?: RequestInit) {
    const res = await couchFetch(couch, docPath, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** CouchDB rejects a PUT without the current `_rev`, so fetch it when the doc exists. */
async function currentRev(couch: CouchConfig, id: string): Promise<string | undefined> {
    const { status, body } = await couchRequest(couch, encodeURIComponent(id));
    return status === 200 ? (body as { _rev?: string })._rev : undefined;
}

async function putDoc(couch: CouchConfig, doc: Record<string, unknown> & { _id: string }) {
    const _rev = await currentRev(couch, doc._id);
    const { status, body } = await couchRequest(couch, encodeURIComponent(doc._id), {
        method: "PUT",
        body: JSON.stringify({ ...doc, ...(_rev ? { _rev } : {}) }),
    });
    if (status !== 201 && status !== 202) {
        throw new Error(`Failed to write ${doc._id}: ${status} ${JSON.stringify(body)}`);
    }
}

export async function seedAuthProvider(options: SeedProviderOptions): Promise<string> {
    const { couch, providerId, label, domain, audience, clientId } = options;
    const updatedTimeUtc = Date.now();

    await putDoc(couch, {
        _id: providerId,
        type: "authProvider",
        domain,
        audience,
        clientId,
        memberOf: PROVIDER_MEMBER_OF,
        displayName: label,
        label,
        sortIndex: options.sortIndex ?? 0,
        userFieldMappings: { externalUserId: "sub", email: "email", name: "name" },
        updatedTimeUtc,
    });

    for (const [index, mapping] of (options.mappings ?? []).entries()) {
        await putDoc(couch, {
            _id: `auto-group-mappings-${providerId}-${index}`,
            type: "autoGroupMappings",
            providerId,
            groupIds: mapping.groupIds,
            conditions: mapping.conditions,
            memberOf: PROVIDER_MEMBER_OF,
            updatedTimeUtc,
        });
    }

    return providerId;
}

/** Applied to every identity including guests, so anonymous app sync has groups. */
export async function seedDefaultGroupMapping(couch: CouchConfig): Promise<void> {
    // No providerId — the API reads provider-less mappings as global defaults.
    await putDoc(couch, {
        _id: E2E_DEFAULT_MAPPING_ID,
        type: "autoGroupMappings",
        groupIds: DEFAULT_GROUPS,
        conditions: [{ type: "authenticated" }],
        memberOf: PROVIDER_MEMBER_OF,
        updatedTimeUtc: Date.now(),
    });
}

/**
 * Written here rather than into `api/src/db/seedingDocs/`, which ships as
 * installation data — this user exists only for the E2E suite.
 */
export async function seedScopedUser(couch: CouchConfig): Promise<void> {
    await putDoc(couch, {
        _id: E2E_SCOPED_USER_ID,
        type: "user",
        name: "Provider Scope User",
        email: E2E_SCOPED_USER_EMAIL,
        memberOf: ["group-private-editors"],
        updatedTimeUtc: Date.now(),
    });
}
