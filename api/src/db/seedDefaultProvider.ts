import { DbService } from "./db.service";
import { DocType } from "../enums";

const DEFAULT_PROVIDER_ID = "oAuthProvider-default";

/** Group that grants public (logged-out) view access */
const PUBLIC_CONTENT_GROUP_ID = "group-public-content";

/**
 * Seeds a default OAuth provider document from env vars when none exists.
 *
 * Uses a deterministic _id so the check is a single O(1) key lookup.
 * Only runs the seeding logic on the very first startup of a fresh database.
 */
export async function seedDefaultProvider(db: DbService): Promise<void> {
    // Fast early-exit: if the default provider document already exists, do nothing
    const existing = await db.getDoc(DEFAULT_PROVIDER_ID);
    if (existing.docs.length > 0) {
        return;
    }

    const domain = process.env.SEED_OAUTH_DOMAIN;
    const clientId = process.env.SEED_OAUTH_CLIENT_ID;
    const audience = process.env.SEED_OAUTH_AUDIENCE;

    if (!domain || !clientId || !audience) {
        console.warn(
            "No default OAuth provider seeded: SEED_OAUTH_DOMAIN, SEED_OAUTH_CLIENT_ID, and SEED_OAUTH_AUDIENCE must be set",
        );
        return;
    }

    const label = process.env.SEED_OAUTH_LABEL || "Default Provider";
    const claimNamespace = process.env.SEED_OAUTH_CLAIM_NAMESPACE || undefined;

    const providerDoc = {
        _id: DEFAULT_PROVIDER_ID,
        type: DocType.OAuthProvider,
        label,
        providerType: "auth0",
        domain: domain.toLowerCase(),
        clientId,
        audience,
        claimNamespace,
        memberOf: [PUBLIC_CONTENT_GROUP_ID],
        updatedTimeUtc: Date.now(),
    };

    await db.upsertDoc(providerDoc);
    console.info(`Seeded default OAuth provider (domain: ${domain})`);
}
