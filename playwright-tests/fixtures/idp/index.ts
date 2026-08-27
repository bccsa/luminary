import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeIdp, type FakeIdp } from "./fakeIdp";
import { loadOrCreateSigningKey, type SigningKey } from "./signingKey";
import { personaIdentities, personas } from "./personas";
import { seedAuthProvider, type CouchConfig, type SeedProviderOptions } from "./seedProvider";
import { assertCouchDatabase, assertSeeded } from "./preflight";

export * from "./authSession";
export * from "./fakeIdp";
export * from "./mint";
export * from "./personas";
export * from "./preflight";
export * from "./seedProvider";
export * from "./signingKey";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(__dirname, "../../.auth");

const KEY_FILE = path.join(authDir, "idp-key.json");
const ENV_FILE = path.join(authDir, "idp.json");

/** Fixed by default: the AuthProvider doc in CouchDB records this origin. */
export const DEFAULT_IDP_PORT = 8099;
export const DEFAULT_AUDIENCE = "luminary-e2e";
export const DEFAULT_CLIENT_ID = "luminary-e2e-client";

/** What a test worker needs in order to mint a token for a persona. */
export type IdpEnvironment = {
    origin: string;
    issuer: string;
    audience: string;
    clientId: string;
    providerId: string;
};

export function readSigningKey(): SigningKey {
    return loadOrCreateSigningKey(KEY_FILE);
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
    port?: number;
    host?: string;
    audience?: string;
    clientId?: string;
    mappings?: SeedProviderOptions["mappings"];
};

/**
 * Starts the issuer, registers it as an AuthProvider in CouchDB, and records
 * where it landed so the workers can mint against it. Call from global setup and
 * return the teardown so the issuer outlives setup but not the run.
 */
export async function startE2eIdp(options: StartE2eIdpOptions): Promise<{
    idp: FakeIdp;
    env: IdpEnvironment;
    stop: () => Promise<void>;
}> {
    clearIdpEnvironment();
    await assertCouchDatabase(options.couch);
    await assertSeeded(options.couch);

    const key = readSigningKey();
    const audience = options.audience ?? DEFAULT_AUDIENCE;
    const clientId = options.clientId ?? DEFAULT_CLIENT_ID;

    const idp = await startFakeIdp({
        key,
        audience,
        clientId,
        host: options.host ?? "127.0.0.1",
        port: options.port ?? DEFAULT_IDP_PORT,
        identities: personaIdentities(),
        defaultIdentity: personas.superAdmin,
    });

    const providerId = await seedAuthProvider({
        couch: options.couch,
        // Scheme included: the API keeps it rather than forcing https.
        domain: idp.origin,
        audience,
        clientId,
        mappings: options.mappings,
    });

    const env: IdpEnvironment = {
        origin: idp.origin,
        issuer: idp.issuer,
        audience,
        clientId,
        providerId,
    };

    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));

    return { idp, env, stop: () => idp.stop() };
}
