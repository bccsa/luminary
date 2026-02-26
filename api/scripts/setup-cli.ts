/**
 * Standalone setup CLI: super-admin access and/or initial + guest OAuth providers.
 * Run from api dir: npm run setup (loads .env from api dir when present).
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as nano from "nano";

function loadEnv(): void {
    const envPath = path.join(process.cwd(), ".env");
    try {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#")) {
                const eq = trimmed.indexOf("=");
                if (eq > 0) {
                    const key = trimmed.slice(0, eq).trim();
                    let val = trimmed.slice(eq + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!(key in process.env)) process.env[key] = val;
                }
            }
        }
    } catch {
        // .env missing or unreadable; rely on existing env
    }
}

loadEnv();

const OAUTH_PROVIDER_DEFAULT = "oAuthProvider-default";
const OAUTH_PROVIDER_GUEST = "oAuthProvider-guest";
const VIEW_DESIGN = "view-user-email-userId";
const VIEW_NAME = "view-user-email-userId";
const DEFAULT_DB = "luminary-local";
/** OAuth providers are always visible to unauthenticated app users (group-public-users) when in this group. */
const PROVIDER_PUBLIC_GROUP = "group-public-content";

type DbScope = ReturnType<nano.ServerScope["use"]>;

function question(rl: readline.Interface, prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => resolve((answer ?? "").trim()));
    });
}

function normalizeBaseUrl(input: string): string {
    const s = input.trim();
    if (!s) return "http://127.0.0.1:5984";
    if (!/^https?:\/\//i.test(s)) return `http://${s}`;
    if (/^https?:[^/]/i.test(s)) return s.replace(/^(https?):/i, "$1://");
    return s;
}

function connectDbFromEnv(dbName: string): DbScope {
    const url = (process.env.DB_CONNECTION_STRING ?? "").trim();
    if (!url || !/^https?:/.test(url)) {
        throw new Error("DB_CONNECTION_STRING must be set and valid (e.g. http://user:pass@127.0.0.1:5984)");
    }
    const client = nano(url);
    return client.use(dbName);
}

async function connectDb(
    baseUrl: string,
    username: string,
    password: string,
    dbName: string,
): Promise<DbScope> {
    const url = normalizeBaseUrl(baseUrl);
    const auth =
        username || password
            ? {
                  requestDefaults: {
                      headers: {
                          Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
                      },
                  },
              }
            : {};
    const client = nano({ url, ...auth });
    return client.use(dbName);
}

async function getDoc(db: DbScope, id: string): Promise<{ _id: string; _rev?: string; [k: string]: unknown } | null> {
    try {
        const doc = await db.get(id);
        return doc as { _id: string; _rev?: string; [k: string]: unknown };
    } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 404) {
            return null;
        }
        throw err;
    }
}

async function getUserByEmail(db: DbScope, email: string): Promise<{ _id: string; _rev?: string; memberOf?: string[]; [k: string]: unknown } | null> {
    const res = (await db.view(VIEW_DESIGN, VIEW_NAME, { keys: [email], include_docs: true })) as { rows: { doc?: unknown }[] };
    const rows = res.rows ?? [];
    const byId = new Map<string, unknown>();
    for (const row of rows) {
        const doc = row.doc;
        if (doc && typeof doc === "object" && "_id" in doc && !byId.has((doc as { _id: string })._id)) {
            byId.set((doc as { _id: string })._id, doc);
        }
    }
    const first = byId.values().next().value;
    return first != null ? (first as { _id: string; _rev?: string; memberOf?: string[]; [k: string]: unknown }) : null;
}

async function upsertDoc(db: DbScope, doc: Record<string, unknown>): Promise<void> {
    const existing = await getDoc(db, doc._id as string);
    if (existing && existing._rev) {
        (doc as { _rev?: string })._rev = existing._rev;
    }
    await db.insert(doc);
}

function parseGroupIds(input: string): string[] {
    return input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

type JwtMappingsParsed = {
    claimNamespace?: string;
    userFieldMappings: { userId?: string; email?: string; name?: string };
    defaultProviderGroupIds: string[];
    guestGroupId?: string;
    claimMappings: Array<{ claim: string; target: string }>;
};

function parseJwtMappingsJson(raw: string): JwtMappingsParsed | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let json: Record<string, unknown>;
    try {
        json = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        try {
            const normalized = trimmed.replace(/,(\s*[}\]])/g, "$1");
            json = JSON.parse(normalized) as Record<string, unknown>;
        } catch {
            return null;
        }
    }
    const result: JwtMappingsParsed = {
        userFieldMappings: {},
        defaultProviderGroupIds: [],
        claimMappings: [],
    };
    const nsFromExpr = (expr: string): { namespace?: string; field?: string } => {
        const m = expr.match(/jwt\s*\[\s*["']([^"']+)["']\s*\]\s*\.\s*(\w+)/);
        return m ? { namespace: m[1], field: m[2] } : {};
    };
    for (const key of ["userId", "email", "name"] as const) {
        const v = json[key];
        if (typeof v === "string") {
            const { namespace, field } = nsFromExpr(v);
            if (namespace) {
                result.claimNamespace = result.claimNamespace ?? namespace;
                if (field) result.userFieldMappings[key] = field;
            }
        }
    }
    const groups = json.groups as Record<string, string> | undefined;
    if (groups && typeof groups === "object") {
        for (const [groupId, expr] of Object.entries(groups)) {
            if (typeof expr !== "string") continue;
            const normalizedExpr = expr.replace(/\s+/g, "");
            if (/\(jwt\)\s*=>\s*!jwt/.test(normalizedExpr)) {
                result.guestGroupId = result.guestGroupId ?? groupId;
            } else {
                result.defaultProviderGroupIds.push(groupId);
            }
        }
    }
    return result;
}

async function grantGroups(db: DbScope, email: string, groupIds: string[]): Promise<void> {
    const user = await getUserByEmail(db, email);
    if (!user) {
        console.error(`No user found for email: ${email}`);
        process.exit(1);
    }
    const memberOf = Array.isArray(user.memberOf) ? [...user.memberOf] : [];
    const toAdd = groupIds.filter((g) => !memberOf.includes(g));
    if (toAdd.length === 0) {
        console.log(`User ${email} already has access to: ${groupIds.join(", ")}.`);
        return;
    }
    memberOf.push(...toAdd);
    const updated = { ...user, memberOf, updatedTimeUtc: Date.now() };
    await upsertDoc(db, updated);
    console.log(`Access granted to ${email}: ${toAdd.join(", ")}.`);
}

async function setupAuthProviders(
    db: DbScope,
    domain: string,
    clientId: string,
    audience: string,
    label: string,
    claimNamespace: string | undefined,
    providerMemberOf: string[],
    guestAssignmentGroupId: string,
    userFieldMappings: { userId?: string; email?: string; name?: string },
    claimMappings: Array<{ claim: string; target: string }>,
    defaultProviderGroupIds: string[],
): Promise<void> {
    const defaultProviderGroupAssignments = defaultProviderGroupIds.map((groupId) => ({
        groupId,
        conditions: [{ type: "authenticated" as const }],
    }));
    const memberOf = [...new Set([PROVIDER_PUBLIC_GROUP, ...providerMemberOf])];
    const defaultDoc: Record<string, unknown> = {
        _id: OAUTH_PROVIDER_DEFAULT,
        type: "oAuthProvider",
        label: label || "Default Provider",
        providerType: "auth0",
        domain: domain.toLowerCase(),
        clientId,
        audience,
        memberOf,
        updatedTimeUtc: Date.now(),
    };
    if (claimNamespace) defaultDoc.claimNamespace = claimNamespace;
    if (userFieldMappings && (userFieldMappings.userId || userFieldMappings.email || userFieldMappings.name)) {
        defaultDoc.userFieldMappings = userFieldMappings;
    }
    if (claimMappings.length) defaultDoc.claimMappings = claimMappings;
    if (defaultProviderGroupAssignments.length) defaultDoc.groupAssignments = defaultProviderGroupAssignments;
    await upsertDoc(db, defaultDoc);
    console.log(`Default OAuth provider updated (domain: ${domain}).`);

    const guestDoc: Record<string, unknown> = {
        _id: OAUTH_PROVIDER_GUEST,
        type: "oAuthProvider",
        label: "Guest",
        providerType: "auth0",
        isGuestProvider: true,
        memberOf,
        groupAssignments:
            guestAssignmentGroupId ?
                [{ groupId: guestAssignmentGroupId, conditions: [{ type: "always" }] }]
            : [],
        updatedTimeUtc: Date.now(),
    };
    await upsertDoc(db, guestDoc);
    console.log("Guest OAuth provider updated.");
}

async function main(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("\nSetup CLI\n");
    console.log("1. Give super-admin access to initial user (by email)");
    console.log("2. Setup initial auth provider + guest auth provider");
    console.log("3. Setup auth providers and initial super-admin user\n");

    const choice = await question(rl, "Choice (1/2/3): ");
    if (!["1", "2", "3"].includes(choice)) {
        console.error("Invalid choice.");
        rl.close();
        process.exit(1);
    }

    const useEnv = !!(process.env.DB_CONNECTION_STRING && process.env.DB_CONNECTION_STRING.trim());
    let db: DbScope;
    if (useEnv) {
        const dbName = process.env.DB_DATABASE?.trim() || DEFAULT_DB;
        console.log("Using DB_CONNECTION_STRING and DB_DATABASE from environment.");
        try {
            db = connectDbFromEnv(dbName);
        } catch (err) {
            console.error("Failed to connect to CouchDB:", err);
            rl.close();
            process.exit(1);
        }
    } else {
        const baseUrl = await question(rl, "CouchDB URL (e.g. http://127.0.0.1:5984): ") || "http://127.0.0.1:5984";
        const username = await question(rl, "CouchDB Username: ");
        const password = await question(rl, "CouchDB Password: ");
        const dbName = await question(rl, `CouchDB Database (default ${DEFAULT_DB}): `) || DEFAULT_DB;
        try {
            db = await connectDb(baseUrl, username, password, dbName);
        } catch (err) {
            console.error("Failed to connect to CouchDB:", err);
            rl.close();
            process.exit(1);
        }
    }

    if (choice === "2" || choice === "3") {
        console.log("\nPaste your JWT_MAPPINGS JSON (from .env or API docs) to auto-fill claim namespace, user fields, and groups. Or press Enter to answer prompts instead.");
        const jwtMappingsInput = await question(rl, "JWT_MAPPINGS (optional): ");
        const parsed = parseJwtMappingsJson(jwtMappingsInput);
        let claimNamespace: string | undefined;
        let userFieldMappings: { userId?: string; email?: string; name?: string } = {};
        let claimMappings: Array<{ claim: string; target: string }> = [];
        let defaultProviderGroupIds: string[];
        let guestAssignmentGroupId: string;
        if (parsed) {
            claimNamespace = parsed.claimNamespace;
            userFieldMappings = parsed.userFieldMappings;
            claimMappings = parsed.claimMappings;
            defaultProviderGroupIds = parsed.defaultProviderGroupIds.length
                ? parsed.defaultProviderGroupIds
                : parseGroupIds(await question(rl, "Group ID(s) to assign when users log in (comma-separated): "));
            guestAssignmentGroupId =
                parsed.guestGroupId ??
                (await question(rl, "Group ID to assign to guest users (optional): ")).trim();
            console.log("  Derived: claim namespace:", claimNamespace ?? "(none)");
            if (Object.keys(userFieldMappings).length) console.log("  Derived user fields:", userFieldMappings);
            if (defaultProviderGroupIds.length) console.log("  Derived groups when logged in:", defaultProviderGroupIds.join(", "));
            if (guestAssignmentGroupId) console.log("  Derived guest group:", guestAssignmentGroupId);
        } else {
            claimNamespace = (await question(rl, "Claim namespace (optional, e.g. https://your-tenant.com/metadata): ")).trim() || undefined;
            const userFieldUserId = (await question(rl, "  User field for userId inside namespace (optional): ")).trim() || undefined;
            const userFieldEmail = (await question(rl, "  User field for email inside namespace (optional): ")).trim() || undefined;
            const userFieldName = (await question(rl, "  User field for name inside namespace (optional): ")).trim() || undefined;
            userFieldMappings =
                userFieldUserId || userFieldEmail || userFieldName
                    ? { userId: userFieldUserId, email: userFieldEmail, name: userFieldName }
                    : {};
            const claimMappingInput = await question(
                rl,
                "Claim names that map to groups, comma-separated (e.g. groups,hasMembership): ",
            );
            claimMappings = parseGroupIds(claimMappingInput).map((claim) => ({ claim, target: "groups" as const }));
            defaultProviderGroupIds = parseGroupIds(
                await question(rl, "Group ID(s) to assign when users log in with this provider (comma-separated): "),
            );
            guestAssignmentGroupId = (await question(rl, "Group ID to assign to guest users (optional): ")).trim();
        }
        const domain = await question(rl, "Auth Domain (e.g. tenant.auth0.com): ");
        const clientId = await question(rl, "Auth Client ID: ");
        const audience = await question(rl, "Auth Audience: ");
        const label = await question(rl, "Provider label (optional, default: Default Provider): ");
        const providerMemberOf = parseGroupIds(
            await question(rl, "Group ID(s) for provider visibility, comma-separated (always includes group-public-content): "),
        );
        if (!domain || !clientId || !audience) {
            console.error("Domain, Client ID, and Audience are required.");
            rl.close();
            process.exit(1);
        }
        await setupAuthProviders(
            db,
            domain,
            clientId,
            audience,
            label,
            claimNamespace,
            providerMemberOf,
            guestAssignmentGroupId,
            userFieldMappings,
            claimMappings,
            defaultProviderGroupIds,
        );
    }

    if (choice === "1" || choice === "3") {
        const groupInput = await question(rl, "Group ID(s) to add to user, comma-separated: ");
        const groupIds = parseGroupIds(groupInput);
        if (groupIds.length === 0) {
            console.error("At least one group ID is required.");
            rl.close();
            process.exit(1);
        }
        const email = await question(rl, "Email: ");
        if (!email) {
            console.error("Email is required.");
            rl.close();
            process.exit(1);
        }
        const confirm = await question(
            rl,
            `Grant access (${groupIds.join(", ")}) to ${email}? (Y/N): `,
        );
        if (confirm.toUpperCase() !== "Y" && confirm.toUpperCase() !== "YES") {
            console.log("Skipped.");
        } else {
            await grantGroups(db, email, groupIds);
        }
    }

    rl.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
