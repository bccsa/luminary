import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeIdp, type FakeIdp } from "./fakeIdp";
import { loadOrCreateSigningKey, type SigningKey } from "./signingKey";
import { personaIdentities } from "./personas";
import {
    seedAuthProvider,
    seedDefaultGroupMapping,
    seedScopedUser,
    type SeedProviderOptions,
} from "./seedProvider";
import { assertCouchDatabase, assertSeeded } from "./preflight";
import { type CouchConfig } from "./couch";

export * from "./authSession";
export * from "./couch";
export * from "./fakeIdp";
export * from "./mint";
export * from "./personas";
export * from "./preflight";
export * from "./seedProvider";
export * from "./signingKey";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(__dirname, "../../.auth");

const ENV_FILE = path.join(authDir, "idp.json");

/** Fixed by default: the AuthProvider docs in CouchDB record these origins. */
export const DEFAULT_IDP_PORT = 8099;

export type ProviderKey = "primary" | "secondary";

/**
 * Two issuers rather than two clients on one, so provider scoping is exercised
 * against genuinely separate domains, keys and JWKS endpoints.
 */
const PROVIDER_DEFS: ReadonlyArray<{
    key: ProviderKey;
    providerId: string;
    clientId: string;
    audience: string;
    label: string;
}> = [
    {
        key: "primary",
        providerId: "auth-provider-e2e",
        clientId: "luminary-e2e-client",
        audience: "luminary-e2e",
        label: "E2E Primary",
    },
    {
        key: "secondary",
        providerId: "auth-provider-e2e-secondary",
        clientId: "luminary-e2e-client-secondary",
        audience: "luminary-e2e-secondary",
        label: "E2E Secondary",
    },
];

/** What a test worker needs in order to mint a token for a persona. */
export type ProviderEnvironment = {
    key: ProviderKey;
    origin: string;
    issuer: string;
    audience: string;
    clientId: string;
    providerId: string;
    label: string;
};

export type IdpEnvironment = {
    providers: Record<ProviderKey, ProviderEnvironment>;
};

export function readSigningKey(provider: ProviderKey = "primary"): SigningKey {
    return loadOrCreateSigningKey(path.join(authDir, `idp-key-${provider}.json`));
}

export function readIdpEnvironment(): IdpEnvironment {
    if (!fs.existsSync(ENV_FILE)) {
        throw new Error(
            `Fake IdP environment not found at ${ENV_FILE}. Persona specs require fake-IdP ` +
                "mode: set E2E_COUCHDB_URL so global setup starts the issuer.",
        );
    }
    return JSON.parse(fs.readFileSync(ENV_FILE, "utf8"));
}

/**
 * A run that dies before teardown leaves the previous environment behind, which
 * would otherwise let workers mint tokens against an issuer that is not running.
 */
export function clearIdpEnvironment(): void {
    fs.rmSync(ENV_FILE, { force: true });
}

export type StartE2eIdpOptions = {
    couch: CouchConfig;
    /** The secondary issuer takes the next port up. */
    port?: number;
    host?: string;
    mappings?: SeedProviderOptions["mappings"];
};

/**
 * Starts both issuers, registers them as AuthProviders in CouchDB, and records
 * where they landed so the workers can mint against them. Call from global setup
 * and return the teardown so they outlive setup but not the run.
 */
export async function startE2eIdp(options: StartE2eIdpOptions): Promise<{
    idps: Record<ProviderKey, FakeIdp>;
    env: IdpEnvironment;
    stop: () => Promise<void>;
}> {
    clearIdpEnvironment();
    await assertCouchDatabase(options.couch);
    await assertSeeded(options.couch);
    await seedDefaultGroupMapping(options.couch);
    await seedScopedUser(options.couch);

    const basePort = options.port ?? DEFAULT_IDP_PORT;
    const identities = personaIdentities();
    const idps = {} as Record<ProviderKey, FakeIdp>;
    const providers = {} as Record<ProviderKey, ProviderEnvironment>;

    for (const [index, def] of PROVIDER_DEFS.entries()) {
        const idp = await startFakeIdp({
            key: readSigningKey(def.key),
            audience: def.audience,
            clientId: def.clientId,
            label: def.label,
            host: options.host ?? "127.0.0.1",
            port: basePort + index,
            identities,
        });

        await seedAuthProvider({
            couch: options.couch,
            providerId: def.providerId,
            label: def.label,
            // Scheme included: the API keeps it rather than forcing https.
            domain: idp.origin,
            audience: def.audience,
            clientId: def.clientId,
            sortIndex: index,
            mappings: index === 0 ? options.mappings : undefined,
        });

        idps[def.key] = idp;
        providers[def.key] = {
            key: def.key,
            origin: idp.origin,
            issuer: idp.issuer,
            audience: def.audience,
            clientId: def.clientId,
            providerId: def.providerId,
            label: def.label,
        };
    }

    const env: IdpEnvironment = { providers };
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));

    return {
        idps,
        env,
        stop: async () => {
            await Promise.all(Object.values(idps).map((idp) => idp.stop()));
        },
    };
}
