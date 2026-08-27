import { test as base, expect, type BrowserContext } from "@playwright/test";
import {
    getPersona,
    mintTokenSet,
    readIdpEnvironment,
    readSigningKey,
    seedAuthSession,
    type ClientTarget,
    type IdpEnvironment,
    type Persona,
    type PersonaKey,
    type ProviderConfig,
} from "./idp";

export type LoginOptions = {
    /** Shorten the token's life to exercise the client's silent-refresh path. */
    expiresInSeconds?: number;
};

export type LoginAs = (persona: PersonaKey, options?: LoginOptions) => Promise<Persona>;

type PersonaTestFixtures = {
    /**
     * Signs the browser context in as a seeded persona. Call before the first
     * navigation — the session is injected as an init script, so a page that has
     * already loaded will not pick it up.
     */
    loginAs: LoginAs;
    modeGuard: undefined;
};

type PersonaWorkerFixtures = {
    idp: IdpEnvironment;
};

/** Persona specs need the local issuer; against a deployment there is none. */
const LOCAL_STACK = !!process.env.E2E_COUCHDB_URL;

function providerConfig(env: IdpEnvironment): ProviderConfig {
    return {
        _id: env.providerId,
        domain: env.origin,
        clientId: env.clientId,
        audience: env.audience,
    };
}

/**
 * An init script only runs on subsequent navigations, so a login after the page
 * has loaded silently does nothing. Failing loudly beats a test that quietly
 * asserts guest behaviour under an authenticated name.
 */
function assertNotNavigated(context: BrowserContext) {
    const navigated = context.pages().filter((page) => page.url() !== "about:blank");
    if (navigated.length > 0) {
        throw new Error(
            `loginAs() must be called before the first navigation (page is at ${navigated[0].url()}). ` +
                "Move it above your page.goto() call.",
        );
    }
}

async function login(
    context: BrowserContext,
    target: ClientTarget,
    env: IdpEnvironment,
    personaKey: PersonaKey,
    options?: LoginOptions,
): Promise<Persona> {
    assertNotNavigated(context);

    const persona = getPersona(personaKey);
    const tokens = mintTokenSet({
        key: readSigningKey(),
        issuer: env.issuer,
        audience: env.audience,
        clientId: env.clientId,
        identity: {
            sub: persona.sub,
            email: persona.email,
            name: persona.name,
            claims: persona.claims,
        },
        expiresInSeconds: options?.expiresInSeconds,
    });

    await seedAuthSession(context, {
        target,
        provider: providerConfig(env),
        tokens,
        profile: { sub: persona.sub, email: persona.email, name: persona.name },
    });

    return persona;
}

function makePersonaTest(target: ClientTarget) {
    return base.extend<PersonaTestFixtures, PersonaWorkerFixtures>({
        modeGuard: [
            async ({}, use, testInfo) => {
                testInfo.skip(
                    !LOCAL_STACK,
                    "Persona specs require fake-IdP mode (set E2E_COUCHDB_URL).",
                );
                await use(undefined);
            },
            { auto: true },
        ],
        // Read once per worker rather than per test — it is a small file, but it
        // is also the same file for every test in the run.
        idp: [
            async ({}, use) => {
                await use(readIdpEnvironment());
            },
            { scope: "worker" },
        ],
        loginAs: async ({ context, idp }, use) => {
            let used = false;
            await use((persona, options) => {
                if (used) {
                    throw new Error(
                        "loginAs() was called twice. A context holds one session; " +
                            "use a separate test to exercise another persona.",
                    );
                }
                used = true;
                return login(context, target, idp, persona, options);
            });
        },
    });
}

/** Use in `app/` specs that need an authenticated app user. */
export const appPersonaTest = makePersonaTest("app");

/** Use in `cms/` specs — the CMS has no unauthenticated state. */
export const cmsPersonaTest = makePersonaTest("cms");

export { expect };
export type { Persona, PersonaKey };
