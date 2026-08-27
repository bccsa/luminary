import type { TokenIdentity } from "./mint";

/**
 * Test identities that line up with `api/src/db/seedingDocs/`. The API links a
 * token to its User doc by `externalUserId` and then falls back to `email`, so
 * matching the seeded email is what puts a persona in its groups.
 */
export type Persona = TokenIdentity & {
    key: string;
    /** Seeded User doc this resolves to, or null for an identity with no User doc. */
    userDoc: string | null;
    /** `memberOf` on that User doc. Default and claim-mapped groups add to this. */
    memberOf: string[];
    /**
     * Groups the resulting AccessMap grants entries for, given the seeded ACLs.
     * Every persona reaches `group-public-content` and `group-public-users`
     * through the default group, on top of whatever its own membership grants.
     */
    reaches: string[];
};

function persona(p: Persona): Persona {
    return p;
}

export const personas = {
    superAdmin: persona({
        key: "superAdmin",
        sub: "e2e|super-admin",
        email: "superadmin@users.test",
        name: "Super Admin",
        userDoc: "user-super-admin",
        memberOf: ["group-super-admins"],
        reaches: [
            "group-super-admins",
            "group-public-editors",
            "group-public-users",
            "group-private-editors",
            "group-private-users",
            "group-public-content",
        ],
    }),

    /** Editor across both content groups. */
    editor1: persona({
        key: "editor1",
        sub: "e2e|editor1",
        email: "editor1@users.test",
        name: "Editor 1",
        userDoc: "user-editor1",
        memberOf: ["group-public-editors", "group-private-editors"],
        reaches: [
            "group-public-content",
            "group-private-content",
            "group-languages",
            "group-public-users",
        ],
    }),

    /** Editor on private content only — the negative case for public-content edits. */
    editor2: persona({
        key: "editor2",
        sub: "e2e|editor2",
        email: "editor2@users.test",
        name: "Editor 2",
        userDoc: "user-editor2",
        memberOf: ["group-private-editors"],
        reaches: [
            "group-private-content",
            "group-languages",
            "group-public-content",
            "group-public-users",
        ],
    }),

    /** Reader who can see both public and private content. */
    privateUser: persona({
        key: "privateUser",
        sub: "e2e|private-user",
        email: "private@users.test",
        name: "Private User",
        userDoc: "user-private",
        memberOf: ["group-private-users"],
        reaches: ["group-public-content", "group-private-content", "group-public-users"],
    }),

    /** Reader limited to public content — the negative case for private content. */
    publicUser: persona({
        key: "publicUser",
        sub: "e2e|public-user",
        email: "public@users.test",
        name: "Public User",
        userDoc: "user-public",
        memberOf: ["group-public-users"],
        reaches: ["group-public-content", "group-public-users"],
    }),

    /**
     * Valid token, no User doc. Exercises the path where a login resolves to
     * default and claim-mapped groups only.
     */
    unlinked: persona({
        key: "unlinked",
        sub: "e2e|unlinked",
        email: "unlinked@users.test",
        name: "Unlinked User",
        userDoc: null,
        memberOf: [],
        reaches: ["group-public-content", "group-public-users"],
    }),
} satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof personas;

export function getPersona(key: PersonaKey): Persona {
    const found = personas[key];
    if (!found) throw new Error(`Unknown persona "${key}"`);
    return found;
}

/** Shape `startFakeIdp` wants for driving the real redirect flow. */
export function personaIdentities(): Record<string, TokenIdentity> {
    return Object.fromEntries(
        Object.values(personas).map((p) => [
            p.key,
            { sub: p.sub, email: p.email, name: p.name, claims: p.claims },
        ]),
    );
}
