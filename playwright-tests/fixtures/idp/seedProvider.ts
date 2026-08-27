/**
 * Writes the AuthProvider and AutoGroupMappings docs the fake issuer needs
 * straight into CouchDB. These are environment wiring, not fixtures shipped with
 * the product, so they deliberately do not live in `api/src/db/seedingDocs/`.
 */

export const E2E_PROVIDER_ID = "auth-provider-e2e";
export const E2E_DEFAULT_MAPPING_ID = "auto-group-mappings-e2e-default";

/** Mirrors the groups `api/scripts/add-auth-provider.ts` assigns. */
const PROVIDER_MEMBER_OF = ["group-super-admins", "group-public-users"];

/** Applied to every identity including guests, so anonymous app sync has groups. */
const DEFAULT_GROUPS = ["group-public-users"];

export type CouchConfig = {
    /** e.g. `http://admin:password@localhost:5984` */
    connectionString: string;
    database: string;
};

export type SeedProviderOptions = {
    couch: CouchConfig;
    /** The fake issuer's origin, scheme included — `http://127.0.0.1:8099`. */
    domain: string;
    audience: string;
    clientId: string;
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
    const url = `${couch.connectionString.replace(/\/+$/, "")}/${couch.database}/${docPath}`;
    const res = await fetch(url, {
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
    const { couch, domain, audience, clientId } = options;
    const updatedTimeUtc = Date.now();

    await putDoc(couch, {
        _id: E2E_PROVIDER_ID,
        type: "authProvider",
        domain,
        audience,
        clientId,
        memberOf: PROVIDER_MEMBER_OF,
        displayName: "E2E Fake IdP",
        label: "E2E Fake IdP",
        userFieldMappings: { externalUserId: "sub", email: "email", name: "name" },
        updatedTimeUtc,
    });

    // No providerId — the API reads provider-less mappings as global defaults.
    await putDoc(couch, {
        _id: E2E_DEFAULT_MAPPING_ID,
        type: "autoGroupMappings",
        groupIds: DEFAULT_GROUPS,
        conditions: [{ type: "authenticated" }],
        memberOf: PROVIDER_MEMBER_OF,
        updatedTimeUtc,
    });

    for (const [index, mapping] of (options.mappings ?? []).entries()) {
        await putDoc(couch, {
            _id: `auto-group-mappings-e2e-${index}`,
            type: "autoGroupMappings",
            providerId: E2E_PROVIDER_ID,
            groupIds: mapping.groupIds,
            conditions: mapping.conditions,
            memberOf: PROVIDER_MEMBER_OF,
            updatedTimeUtc,
        });
    }

    return E2E_PROVIDER_ID;
}
