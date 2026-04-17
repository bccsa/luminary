#!/usr/bin/env ts-node
// Run inside the API container: docker exec -it <container> npm run auth-setup
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { randomUUID } from "crypto";

// ── Types ───────────────────────────────────────────────────────────────────────
//
// These mirror the DTO types defined in api/src/dto/. The script writes directly
// to CouchDB so it doesn't go through the API's validation pipeline.

interface AuthProviderDoc {
    _id: string;
    _rev?: string;
    type: "authProvider";
    domain: string;
    audience: string;
    clientId: string;
    memberOf: string[];
    userFieldMappings?: {
        externalUserId?: string;
        email?: string;
        name?: string;
    };
    label?: string;
    icon?: string;
    backgroundColor?: string;
    textColor?: string;
    iconOpacity?: number;
    imageBucketId?: string;
    imageData?: Record<string, unknown>;
    updatedTimeUtc: number;
}

interface AuthProviderCondition {
    type: "authenticated" | "claimEquals" | "claimIn";
    claimPath?: string;
    value?: string;
    values?: string[];
}

/**
 * Each auto group mapping is its own document in the database.
 * It links to an auth provider via `providerId` and defines which groups
 * to assign when certain JWT claim conditions are met.
 */
interface AutoGroupMappingDoc {
    _id: string;
    _rev?: string;
    type: "autoGroupMappings";
    providerId: string;
    groupIds: string[];
    conditions: AuthProviderCondition[];
    memberOf: string[];
    updatedTimeUtc: number;
}

interface AclEntry {
    type: string;
    groupId: string;
    permission: string[];
}

interface GroupDoc {
    _id: string;
    _rev?: string;
    type: "group";
    name: string;
    acl: AclEntry[];
    memberOf: string[];
    updatedTimeUtc: number;
    [key: string]: unknown;
}

interface UserDoc {
    _id: string;
    _rev?: string;
    type: "user";
    email: string;
    name: string;
    memberOf: string[];
    providerId?: string;
    externalUserId?: string;
    lastLogin?: number;
    updatedTimeUtc: number;
}

interface CouchDbResponse {
    ok?: boolean;
    id?: string;
    rev?: string;
    error?: string;
    reason?: string;
}

interface FindResult<T> {
    docs: T[];
    bookmark?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────────

/** Groups that every auth provider document is automatically a member of (for ACL visibility). */
const AUTO_MEMBER_OF = ["group-super-admins", "group-public-users"];

/** Groups automatically assigned to all users (including unauthenticated guests). */
const AUTO_DEFAULT_GROUPS = ["group-public-users"];

// ── Environment ─────────────────────────────────────────────────────────────────

const apiDir = path.resolve(__dirname);
const envPath = path.join(apiDir, "..", ".env");

if (!fs.existsSync(envPath)) {
    console.error(`Error: .env file not found at ${envPath}`);
    console.error("Make sure you're running this script from the api directory.");
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");

function getEnvVar(name: string): string {
    const match = envContent.match(new RegExp(`^${name}=(.*)$`, "m"));
    return match ? match[1].replace(/^["']|["']$/g, "") : "";
}

const DB_CONNECTION_STRING = getEnvVar("DB_CONNECTION_STRING");
const DB_DATABASE = getEnvVar("DB_DATABASE");

if (!DB_CONNECTION_STRING || !DB_DATABASE) {
    console.error("Error: DB_CONNECTION_STRING or DB_DATABASE not found in .env");
    process.exit(1);
}

// ── Readline helper ─────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

// ── CouchDB helpers ─────────────────────────────────────────────────────────────

function couchRequest<T = any>(method: string, docPath: string, body?: unknown): Promise<T> {
    const fullUrl = `${DB_CONNECTION_STRING}/${DB_DATABASE}/${docPath}`;
    const parsed = new URL(fullUrl);
    const lib = parsed.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || undefined,
                path: parsed.pathname + parsed.search,
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
                },
                auth: parsed.username
                    ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(
                          parsed.password,
                      )}`
                    : undefined,
            },
            (res) => {
                let data = "";
                res.on("data", (d) => (data += d));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error(`Invalid JSON from CouchDB: ${data}`));
                    }
                });
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function putDoc(id: string, doc: unknown): Promise<CouchDbResponse> {
    return couchRequest("PUT", id, doc);
}

function getDoc<T>(id: string): Promise<T> {
    return couchRequest("GET", id);
}

function find<T>(selector: Record<string, unknown>, limit = 100): Promise<FindResult<T>> {
    return couchRequest("POST", "_find", { selector, limit });
}

function bulkDocs(docs: unknown[]): Promise<CouchDbResponse[]> {
    return couchRequest("POST", "_bulk_docs", { docs });
}

function prettyPrint(obj: unknown) {
    console.log(JSON.stringify(obj, null, 2));
}

/** Merge multiple string arrays into a single array with no duplicates. */
function uniqueStrings(...arrays: string[][]): string[] {
    return Array.from(new Set(arrays.flat()));
}

// ── Group mapping helpers ───────────────────────────────────────────────────────

/**
 * Interactive wizard that collects auto group mapping rules from the user.
 *
 * Each rule says: "When a user's JWT matches this condition, assign them
 * to these groups." Multiple conditions on the same mapping use OR logic.
 */
async function collectGroupMappings(): Promise<
    { groupIds: string[]; conditions: AuthProviderCondition[] }[]
> {
    const mappings: { groupIds: string[]; conditions: AuthProviderCondition[] }[] = [];

    while (true) {
        console.log("");
        const groupsRaw = await prompt(
            "  Group IDs to assign (comma-separated, or press Enter to finish): ",
        );
        if (!groupsRaw) break;

        const groupIds = groupsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (groupIds.length === 0) {
            console.log("  No valid group IDs entered, skipping this mapping.");
            continue;
        }

        console.log("");
        console.log(`  When should users be assigned to [${groupIds.join(", ")}]?`);
        console.log("");
        console.log("    1) Always           -- Any authenticated user gets these groups");
        console.log("    2) Claim equals     -- A specific JWT claim must equal a value");
        console.log("    3) Claim is in list -- A JWT claim must match one of several values");
        console.log("");
        const choice = await prompt("  Select condition type [1-3]: ");

        const condition: AuthProviderCondition = {} as AuthProviderCondition;

        switch (choice) {
            case "1":
                condition.type = "authenticated";
                break;
            case "2":
                condition.type = "claimEquals";
                condition.claimPath = await prompt(
                    "  JWT claim path (e.g. 'roles', 'https://example.com/metadata.role'): ",
                );
                condition.value = await prompt("  Required value (exact match): ");
                break;
            case "3": {
                condition.type = "claimIn";
                condition.claimPath = await prompt(
                    "  JWT claim path (e.g. 'roles', 'https://example.com/metadata.role'): ",
                );
                console.log("  Enter allowed values one per line. Press Enter on an empty line to finish.");
                const values: string[] = [];
                while (true) {
                    const val = await prompt("    Value: ");
                    if (!val) break;
                    values.push(val);
                }
                condition.values = values;
                break;
            }
            default:
                console.log("  Invalid choice, skipping this mapping.");
                continue;
        }

        mappings.push({ groupIds, conditions: [condition] });
        console.log("  Mapping added.");
    }

    return mappings;
}

// ── Add Auth Provider ───────────────────────────────────────────────────────────

async function addAuthProvider(): Promise<string | null> {
    console.log("");
    console.log("=".repeat(60));
    console.log("  Add a New Auth Provider (OIDC / Auth0)");
    console.log("=".repeat(60));
    console.log("");
    console.log("This will create the database documents needed for users to");
    console.log("log in with an external identity provider (e.g. Auth0, Okta).");
    console.log("");

    // ── Required fields ────────────────────────────────────────────────────

    const domain = await prompt("OIDC domain (e.g. yourapp.auth0.com): ");
    if (!domain) {
        console.log("Domain is required. Aborting.");
        return null;
    }

    const defaultAudience = `https://${domain}`;
    const audienceInput = await prompt(
        `API audience / resource identifier [default: ${defaultAudience}]: `,
    );
    const audience = audienceInput || defaultAudience;

    const clientId = await prompt("Client ID (from your OIDC provider dashboard): ");
    if (!clientId) {
        console.log("Client ID is required. Aborting.");
        return null;
    }

    const label = await prompt("Button label shown on login screen (e.g. 'Sign in with Google') [optional]: ");

    // ── Group membership (ACL visibility) ──────────────────────────────────

    console.log("");
    console.log("-- Group Membership --");
    console.log("");
    console.log("The auth provider document needs to be a member of at least one");
    console.log("group so that users with permission to that group can see it.");
    console.log(`Auto-included: ${AUTO_MEMBER_OF.join(", ")}`);
    console.log("");
    console.log("Add any extra groups below. Press Enter on an empty line to finish.");

    const extraGroups: string[] = [];
    while (true) {
        const group = await prompt("  Extra group ID: ");
        if (!group) break;
        extraGroups.push(group);
    }
    const memberOf = uniqueStrings(AUTO_MEMBER_OF, extraGroups);

    // ── User field mappings ────────────────────────────────────────────────

    console.log("");
    console.log("-- JWT Claim Mappings --");
    console.log("");
    console.log("Tell us which JWT claims contain the user's identity fields.");
    console.log("These are used to match incoming tokens to user accounts.");
    console.log("");
    console.log("Many Auth0 tenants add custom user info (email, personId, etc.)");
    console.log("under a URL-like namespace from a post-login action, e.g.");
    console.log("  api.accessToken.setCustomClaim(\"https://example.com/metadata/email\", ...)");
    console.log("If your tenant does this, enter the namespace below (no trailing slash).");
    console.log("The claim-path defaults in the next prompts will be pre-filled with it.");
    console.log("Leave blank to use the bare OIDC claim names (sub / email / name).");
    console.log("");

    const namespaceRaw = (await prompt("  Custom claim namespace [optional]: ")).trim();
    const namespace = namespaceRaw.replace(/\/+$/, "");
    const defaultPath = (leaf: string) => (namespace ? `${namespace}.${leaf}` : leaf);

    console.log("");
    console.log("Press Enter on each prompt to accept the default in brackets.");
    console.log("");

    const ufmExternalUserId =
        (await prompt(`  External user ID claim [default: ${defaultPath("sub")}]: `)) ||
        defaultPath("sub");
    const ufmEmail =
        (await prompt(`  Email claim            [default: ${defaultPath("email")}]: `)) ||
        defaultPath("email");
    const ufmName =
        (await prompt(`  Display name claim     [default: ${defaultPath("name")}]: `)) ||
        defaultPath("name");

    // Flag namespaced (URL-like or dotted) claim paths — for these, the Auth0
    // post-login action MUST add the claim to the access token (not just the
    // ID token), or the API will verify the token but find no matching claim
    // and surface a cryptic SigningKeyNotFoundError / no-user-found.
    const looksNamespaced = (p: string) => p.includes("/") || p.includes("://");
    if (
        looksNamespaced(ufmExternalUserId) ||
        looksNamespaced(ufmEmail) ||
        looksNamespaced(ufmName)
    ) {
        console.log("");
        console.log("⚠️  IMPORTANT — access-token vs. ID-token claims");
        console.log("");
        console.log("You configured namespaced claim paths. These must be added to the");
        console.log("ACCESS token your SPA sends to the API — not only the ID token.");
        console.log("In your Auth0 post-login action, call BOTH:");
        console.log("  api.idToken.setCustomClaim(\"<namespace>/email\", event.user.email);");
        console.log("  api.accessToken.setCustomClaim(\"<namespace>/email\", event.user.email);");
        console.log("Actions that only call api.idToken.setCustomClaim(...) will silently");
        console.log("fail on the API — the server sees an access token without those claims,");
        console.log("can't match the user, and falls back to default groups only.");
        console.log("");
    }

    // ── Auto group mappings ────────────────────────────────────────────────

    console.log("");
    console.log("-- Auto Group Mappings --");
    console.log("");
    console.log("Auto group mappings automatically assign users to groups based");
    console.log("on their JWT claims when they log in through this provider.");
    console.log("");
    console.log("A default mapping will be created that assigns all authenticated");
    console.log("users to 'group-public-users'. You can add more rules below.");
    console.log("");

    const extraMappings = await collectGroupMappings();

    // Build the list: default "authenticated" mapping + any extras
    const allMappingRules: { groupIds: string[]; conditions: AuthProviderCondition[] }[] = [
        { groupIds: ["group-public-users"], conditions: [{ type: "authenticated" }] },
        ...extraMappings,
    ];

    // ── Build documents ────────────────────────────────────────────────────

    const providerId = randomUUID();
    const now = Date.now();

    const providerDoc: AuthProviderDoc = {
        _id: providerId,
        type: "authProvider",
        domain,
        audience,
        clientId,
        memberOf,
        userFieldMappings: {
            externalUserId: ufmExternalUserId,
            email: ufmEmail,
            name: ufmName,
        },
        updatedTimeUtc: now,
    };
    if (label) providerDoc.label = label;

    // Each mapping rule becomes its own AutoGroupMappings document
    const mappingDocs: AutoGroupMappingDoc[] = allMappingRules.map((rule) => ({
        _id: randomUUID(),
        type: "autoGroupMappings",
        providerId,
        groupIds: rule.groupIds,
        conditions: rule.conditions,
        memberOf, // same visibility as the provider
        updatedTimeUtc: now,
    }));

    // ── Confirm and write ──────────────────────────────────────────────────

    console.log("");
    console.log("-".repeat(60));
    console.log("  Review: Auth Provider");
    console.log("-".repeat(60));
    prettyPrint(providerDoc);

    console.log("");
    console.log("-".repeat(60));
    console.log(`  Review: ${mappingDocs.length} Auto Group Mapping(s)`);
    console.log("-".repeat(60));
    mappingDocs.forEach((m, i) => {
        console.log(`\n  Mapping ${i + 1}: assign [${m.groupIds.join(", ")}] when:`);
        m.conditions.forEach((c) => {
            if (c.type === "authenticated") console.log("    - User is authenticated");
            if (c.type === "claimEquals") console.log(`    - ${c.claimPath} = "${c.value}"`);
            if (c.type === "claimIn")
                console.log(`    - ${c.claimPath} IN [${(c.values ?? []).join(", ")}]`);
        });
    });

    console.log("");
    const confirm = await prompt("Write these documents to CouchDB? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Aborted. No changes were made.");
        return null;
    }

    // Write provider
    const providerRes = await putDoc(providerDoc._id, providerDoc);
    if (providerRes.ok) {
        console.log(`\n  Auth provider created: ${providerDoc._id}`);
    } else {
        console.log(`\n  Failed to create auth provider: ${providerRes.error} - ${providerRes.reason}`);
        return null;
    }

    // Write mappings
    const mappingResults = await bulkDocs(mappingDocs);
    const mappingErrors = mappingResults.filter((r) => r.error);
    if (mappingErrors.length === 0) {
        console.log(`  ${mappingDocs.length} auto group mapping(s) created.`);
    } else {
        console.log(`  ${mappingErrors.length} mapping(s) failed to create:`);
        mappingErrors.forEach((e) => console.log(`    ${e.error}: ${e.reason}`));
    }

    // Ensure ACLs
    await ensureGroupAcls();

    // Offer to backfill users
    console.log("");
    console.log("-- Backfill Existing Users --");
    console.log("");
    console.log("If you have existing user documents in the database, you can");
    console.log("set their providerId field to link them to this new provider.");
    console.log("");
    console.log("Scope options:");
    console.log("  1) Only users without a providerId (safe — recommended)");
    console.log("     Never touches users already linked to another provider.");
    console.log("  2) ALL users (overwrites existing providerId on every user)");
    console.log("     Only safe when migrating from a single-provider setup.");
    console.log("  3) Skip backfill");
    console.log("");
    const backfillChoice = await prompt("Select [1-3, default 3]: ");
    if (backfillChoice === "1") {
        await backfillUsers(providerId, { mode: "unassigned" });
    } else if (backfillChoice === "2") {
        console.log("");
        console.log("⚠️  This will OVERWRITE providerId on every user doc, including those");
        console.log("   already linked to a different provider.");
        const confirmAll = await prompt("Type 'overwrite' to proceed, anything else to cancel: ");
        if (confirmAll === "overwrite") {
            await backfillUsers(providerId, { mode: "all" });
        } else {
            console.log("Backfill cancelled.");
        }
    } else {
        console.log("Skipping backfill.");
    }

    console.log("");
    console.log("Done! Users can now log in with this provider.");
    return providerId;
}

// ── Backfill users ──────────────────────────────────────────────────────────────

async function backfillUsers(
    providerId: string,
    options: { mode: "unassigned" | "all" } = { mode: "unassigned" },
) {
    console.log("  Fetching all user documents...");

    const allUsers: any[] = [];
    let bookmark: string | undefined;

    while (true) {
        const body: any = { selector: { type: "user" }, limit: 200 };
        if (bookmark) body.bookmark = bookmark;

        const result = await couchRequest<FindResult<any>>("POST", "_find", body);
        if (result.docs && result.docs.length > 0) {
            allUsers.push(...result.docs);
            bookmark = result.bookmark;
            if (result.docs.length < 200) break;
        } else {
            break;
        }
    }

    console.log(`  Found ${allUsers.length} user(s).`);
    if (allUsers.length === 0) return;

    // Respect existing providerId assignments unless the caller explicitly
    // opted into "all". Prevents a second-provider backfill from silently
    // overwriting users already linked to the first provider.
    const targets =
        options.mode === "all"
            ? allUsers
            : allUsers.filter((u) => !u.providerId);
    const skipped = allUsers.length - targets.length;

    if (targets.length === 0) {
        console.log(`  No users match the selected scope (${skipped} already have a providerId).`);
        return;
    }

    let migratedUserIdCount = 0;
    const bulk = targets.map((u) => {
        const updated = { ...u, providerId };

        // Migrate legacy userId field to the current externalUserId field.
        // Coerce to string to adhere to query find lookup
        if (!updated.externalUserId && updated.userId) {
            updated.externalUserId = String(updated.userId);
            migratedUserIdCount++;
        }

        return updated;
    });

    console.log(`  Updating ${targets.length} user(s); skipping ${skipped} already-linked user(s).`);
    if (migratedUserIdCount > 0) {
        console.log(`  Also migrating legacy userId -> externalUserId for ${migratedUserIdCount} user(s).`);
    }

    const results = await bulkDocs(bulk);
    const errors = results.filter((r) => r.error);

    if (errors.length === 0) {
        console.log(`  Successfully updated ${targets.length} user(s).`);
    } else {
        console.log(`  Completed with ${errors.length} error(s):`);
        errors.forEach((e) => console.log(`    ${JSON.stringify(e)}`));
    }
}

// ── Ensure group ACLs ───────────────────────────────────────────────────────────
//
// The ACL system controls which user groups can view/edit/delete each document
// type. This function ensures the seed groups have the right permissions for
// the auth-related document types.

const REQUIRED_ACLS: { groupId: string; entries: AclEntry[] }[] = [
    {
        groupId: "group-public-users",
        entries: [
            {
                type: "authProvider",
                groupId: "group-public-users",
                permission: ["view"],
            },
        ],
    },
    {
        groupId: "group-super-admins",
        entries: [
            {
                type: "authProvider",
                groupId: "group-super-admins",
                permission: ["view", "edit", "delete", "assign"],
            },
            {
                type: "autoGroupMappings",
                groupId: "group-super-admins",
                permission: ["view", "edit", "delete", "assign"],
            },
        ],
    },
];

async function ensureGroupAcls() {
    console.log("");
    console.log("-- Checking Group ACL Permissions --");
    console.log("");
    console.log("Making sure the seed groups have the right permissions for");
    console.log("auth providers, auto group mappings, and default permissions.");
    console.log("");

    for (const { groupId, entries } of REQUIRED_ACLS) {
        let groupDoc: GroupDoc;
        try {
            groupDoc = await getDoc<GroupDoc>(groupId);
            if ((groupDoc as any).error) {
                console.log(`  Warning: Group '${groupId}' not found in database, skipping.`);
                continue;
            }
        } catch {
            console.log(`  Warning: Could not fetch '${groupId}', skipping.`);
            continue;
        }

        // Clean up stale/invalid ACL entries (e.g. removed doc types, undefined types)
        const validTypes = [
            "post", "tag", "group", "user", "language", "redirect",
            "storage", "authProvider", "autoGroupMappings",
        ];
        const beforeCount = groupDoc.acl.length;
        groupDoc.acl = groupDoc.acl.filter((a) => a.type && validTypes.includes(a.type));
        const removed = beforeCount - groupDoc.acl.length;
        let changed = removed > 0;
        if (removed > 0) {
            console.log(`  - Removed ${removed} stale/invalid ACL entry(s) from ${groupId}`);
        }

        for (const required of entries) {
            const existing = groupDoc.acl.find(
                (a) => a.type === required.type && a.groupId === required.groupId,
            );
            if (!existing) {
                groupDoc.acl.push(required);
                changed = true;
                console.log(`  + Added ${required.type} permissions to ${groupId}`);
            } else {
                const missing = required.permission.filter((p) => !existing.permission.includes(p));
                if (missing.length > 0) {
                    existing.permission.push(...missing);
                    changed = true;
                    console.log(
                        `  + Added missing [${missing.join(", ")}] to ${required.type} on ${groupId}`,
                    );
                }
            }
        }

        if (changed) {
            groupDoc.updatedTimeUtc = Date.now();
            const res = await putDoc(groupDoc._id, groupDoc);
            if (res.ok) {
                console.log(`  Updated ${groupId}`);
            } else {
                console.log(`  Failed to update ${groupId}: ${res.error} - ${res.reason}`);
            }
        } else {
            console.log(`  ${groupId} already has all required permissions.`);
        }
    }
}

// ── Modify Auth Provider ────────────────────────────────────────────────────────

async function modifyAuthProvider() {
    console.log("");
    console.log("=".repeat(60));
    console.log("  Modify an Existing Auth Provider");
    console.log("=".repeat(60));
    console.log("");

    const result = await find<AuthProviderDoc>({ type: "authProvider" });
    const providers = result.docs || [];

    if (providers.length === 0) {
        console.log("No auth providers found. Use 'Add Auth Provider' to create one first.");
        return;
    }

    console.log("Select the auth provider to modify:");
    console.log("");
    providers.forEach((p, i) => {
        const tag = p.label ? `${p.label} - ` : "";
        console.log(`  ${i + 1}) ${tag}${p.domain} (ID: ${p._id})`);
    });
    console.log("");

    const choiceStr = await prompt(`Select [1-${providers.length}]: `);
    const choice = parseInt(choiceStr, 10);
    if (isNaN(choice) || choice < 1 || choice > providers.length) {
        console.log("Invalid selection.");
        return;
    }

    const provider = providers[choice - 1];

    // Load current values
    let domain = provider.domain;
    let audience = provider.audience;
    let clientId = provider.clientId;
    let label = provider.label || "";
    let memberOf = provider.memberOf || [...AUTO_MEMBER_OF];
    let ufmExternalUserId = provider.userFieldMappings?.externalUserId || "sub";
    let ufmEmail = provider.userFieldMappings?.email || "email";
    let ufmName = provider.userFieldMappings?.name || "name";

    // Load existing auto group mappings for this provider
    const existingMappingsResult = await find<AutoGroupMappingDoc>({
        type: "autoGroupMappings",
        providerId: provider._id,
    });
    let existingMappings = existingMappingsResult.docs || [];

    console.log("");
    console.log("Edit fields by selecting their number. Press Q when done.");

    while (true) {
        console.log("");
        console.log(`  1) Domain              : ${domain}`);
        console.log(`  2) Audience            : ${audience}`);
        console.log(`  3) Client ID           : ${clientId}`);
        console.log(`  4) Button label        : ${label || "(none)"}`);
        console.log(`  5) Group membership    : ${memberOf.join(", ")}`);
        console.log(
            `  6) Claim mappings      : userId=${ufmExternalUserId}, email=${ufmEmail}, name=${ufmName}`,
        );
        console.log(`  7) Auto group mappings : ${existingMappings.length} mapping(s)`);
        console.log("  Q) Done - save changes");
        console.log("");

        const fieldChoice = await prompt("Select [1-7 or Q]: ");

        switch (fieldChoice) {
            case "1": {
                const v = await prompt(`  New domain [${domain}]: `);
                if (v) domain = v;
                break;
            }
            case "2": {
                const v = await prompt(`  New audience [${audience}]: `);
                if (v) audience = v;
                break;
            }
            case "3": {
                const v = await prompt(`  New client ID [${clientId}]: `);
                if (v) clientId = v;
                break;
            }
            case "4": {
                const v = await prompt(`  New button label [${label}] (space to clear): `);
                if (v === " ") label = "";
                else if (v) label = v;
                break;
            }
            case "5": {
                console.log(`  Current: ${memberOf.join(", ")}`);
                console.log(`  Auto-included: ${AUTO_MEMBER_OF.join(", ")}`);
                console.log("  Enter additional group IDs. Press Enter to finish.");
                const newExtra: string[] = [];
                let entered = false;
                while (true) {
                    const g = await prompt("    Group ID: ");
                    if (!g) break;
                    newExtra.push(g);
                    entered = true;
                }
                if (entered) memberOf = uniqueStrings(AUTO_MEMBER_OF, newExtra);
                break;
            }
            case "6": {
                console.log("  Press Enter to keep current value.");
                let v = await prompt(`  External user ID claim [${ufmExternalUserId}]: `);
                if (v) ufmExternalUserId = v;
                v = await prompt(`  Email claim [${ufmEmail}]: `);
                if (v) ufmEmail = v;
                v = await prompt(`  Name claim [${ufmName}]: `);
                if (v) ufmName = v;
                break;
            }
            case "7": {
                console.log("  Current auto group mappings:");
                if (existingMappings.length === 0) {
                    console.log("    (none)");
                } else {
                    existingMappings.forEach((m, i) => {
                        const condDesc = m.conditions
                            .map((c) => {
                                if (c.type === "authenticated") return "authenticated";
                                if (c.type === "claimEquals") return `${c.claimPath}="${c.value}"`;
                                if (c.type === "claimIn")
                                    return `${c.claimPath} IN [${(c.values ?? []).join(",")}]`;
                                return "?";
                            })
                            .join(" OR ");
                        console.log(`    ${i + 1}) [${m.groupIds.join(", ")}] when: ${condDesc}`);
                    });
                }
                console.log("");
                const replace = await prompt("  Replace all mappings? (y/n): ");
                if (replace.toLowerCase() === "y") {
                    console.log("  Enter new mappings:");
                    const newRules = await collectGroupMappings();
                    // Mark old docs for deletion
                    existingMappings = newRules.map((rule) => ({
                        _id: randomUUID(),
                        type: "autoGroupMappings" as const,
                        providerId: provider._id,
                        groupIds: rule.groupIds,
                        conditions: rule.conditions,
                        memberOf,
                        updatedTimeUtc: Date.now(),
                    }));
                }
                break;
            }
            case "Q":
            case "q":
                break;
            default:
                console.log("  Invalid choice.");
                continue;
        }

        if (fieldChoice.toLowerCase() === "q") break;
    }

    // Validate
    if (!domain || !audience || !clientId) {
        console.log("Domain, audience, and client ID are all required. Aborting.");
        return;
    }

    memberOf = uniqueStrings(AUTO_MEMBER_OF, memberOf);
    const now = Date.now();

    // Build updated provider doc (preserves icon/image fields)
    const updatedProvider: AuthProviderDoc = {
        ...provider,
        domain,
        audience,
        clientId,
        memberOf,
        userFieldMappings: {
            externalUserId: ufmExternalUserId,
            email: ufmEmail,
            name: ufmName,
        },
        updatedTimeUtc: now,
    };
    if (label) updatedProvider.label = label;
    else delete updatedProvider.label;

    console.log("");
    console.log("-".repeat(60));
    console.log("  Review: Updated Auth Provider");
    console.log("-".repeat(60));
    prettyPrint(updatedProvider);

    console.log("");
    const confirm = await prompt("Save changes to CouchDB? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Aborted. No changes were made.");
        return;
    }

    const providerRes = await putDoc(updatedProvider._id, updatedProvider);
    if (providerRes.ok) {
        console.log(`  Auth provider updated.`);
    } else {
        console.log(`  Failed: ${providerRes.error} - ${providerRes.reason}`);
    }

    // Delete old mappings and write new ones if they were replaced
    const oldMappingsResult = await find<AutoGroupMappingDoc>({
        type: "autoGroupMappings",
        providerId: provider._id,
    });
    const oldMappings = oldMappingsResult.docs || [];

    if (oldMappings.length > 0) {
        const deleteDocs = oldMappings.map((m) => ({ ...m, _deleted: true }));
        await bulkDocs(deleteDocs);
        console.log(`  Removed ${oldMappings.length} old mapping(s).`);
    }

    if (existingMappings.length > 0) {
        // Remove _rev from new mappings (they are new documents)
        const newMappings = existingMappings.map((m) => {
            const { _rev, ...rest } = m;
            return rest;
        });
        const mappingResults = await bulkDocs(newMappings);
        const mappingErrors = mappingResults.filter((r) => r.error);
        if (mappingErrors.length === 0) {
            console.log(`  ${newMappings.length} mapping(s) saved.`);
        } else {
            console.log(`  ${mappingErrors.length} mapping(s) failed:`);
            mappingErrors.forEach((e) => console.log(`    ${JSON.stringify(e)}`));
        }
    }

    console.log("\n  Done!");
}

// ── Configure Default Groups ────────────────────────────────────────────────────

async function configureDefaultGroups() {
    console.log("");
    console.log("=".repeat(60));
    console.log("  Configure Default Groups");
    console.log("=".repeat(60));
    console.log("");
    console.log("Default groups are the baseline permissions assigned to EVERY");
    console.log("user -- including unauthenticated guests who haven't logged in.");
    console.log("");
    console.log("These are stored as an AutoGroupMappings document without a");
    console.log("provider, meaning they apply globally to all users.");
    console.log("");
    console.log(`Auto-included: ${AUTO_DEFAULT_GROUPS.join(", ")}`);
    console.log("Enter additional group IDs below. Press Enter to finish.");
    console.log("");

    const extraGroups: string[] = [];
    while (true) {
        const groupId = await prompt("  Group ID: ");
        if (!groupId) break;
        extraGroups.push(groupId);
    }

    const defaultGroups = uniqueStrings(AUTO_DEFAULT_GROUPS, extraGroups);

    console.log("");
    console.log(`Groups to set: ${defaultGroups.join(", ")}`);

    // Check for existing provider-less mapping
    const existingResult = await find<AutoGroupMappingDoc & { error?: string }>({
        type: "autoGroupMappings",
        $or: [{ providerId: { $exists: false } }, { providerId: "" }],
    });
    const existingDoc = existingResult.docs?.[0] ?? null;

    if (existingDoc?._rev) {
        console.log("");
        console.log(`An existing global mapping was found.`);
        console.log(`Current groups: ${(existingDoc.groupIds || []).join(", ")}`);
        const overwrite = await prompt("Overwrite with the new list? (y/n): ");
        if (overwrite.toLowerCase() !== "y") {
            console.log("No changes made.");
            return;
        }
    } else {
        console.log("No existing global mapping found -- creating a new one.");
    }

    const doc: AutoGroupMappingDoc = {
        _id: existingDoc?._id ?? randomUUID(),
        type: "autoGroupMappings",
        providerId: "",
        groupIds: defaultGroups,
        conditions: [],
        memberOf: ["group-super-admins"],
        updatedTimeUtc: Date.now(),
        ...(existingDoc?._rev ? { _rev: existingDoc._rev } : {}),
    };

    const response = await putDoc(doc._id, doc);
    if (response.ok) {
        console.log("\n  Default groups saved as global auto group mapping.");
    } else {
        console.log(`\n  Failed: ${response.error} - ${response.reason}`);
    }
}

// ── Create Super Admin User ─────────────────────────────────────────────────────

async function createSuperAdminUser(defaultProviderId?: string): Promise<void> {
    console.log("");
    console.log("=".repeat(60));
    console.log("  Create Super Admin User");
    console.log("=".repeat(60));
    console.log("");
    console.log("This creates a user document with membership in 'group-super-admins',");
    console.log("giving them full permissions across all document types.");
    console.log("");
    console.log("On login, users are matched first by externalUserId, then by email.");
    console.log("Providing only an email means any login with that email gets super");
    console.log("admin access. Providing an externalUserId pins it to a specific");
    console.log("identity at a specific provider.");
    console.log("");

    const email = await prompt("Email address: ");
    if (!email) {
        console.log("Email is required. Aborting.");
        return;
    }

    const name = await prompt("Display name: ");
    if (!name) {
        console.log("Name is required. Aborting.");
        return;
    }

    let providerId: string | undefined;
    let externalUserId: string | undefined;

    console.log("");
    console.log("-- Link to Auth Provider (optional) --");
    console.log("");

    if (defaultProviderId) {
        console.log(`A newly-created auth provider (${defaultProviderId}) is available.`);
        const useIt = await prompt("Link this super admin to that provider? (y/n): ");
        if (useIt.toLowerCase() === "y") {
            providerId = defaultProviderId;
            const ext = await prompt(
                "  External user ID (e.g. JWT 'sub' value) [Enter to skip]: ",
            );
            if (ext) externalUserId = ext;
        }
    } else {
        const linkConfirm = await prompt("Link to an existing auth provider? (y/n): ");
        if (linkConfirm.toLowerCase() === "y") {
            const result = await find<AuthProviderDoc>({ type: "authProvider" });
            const providers = result.docs || [];

            if (providers.length === 0) {
                console.log("  No auth providers found. Skipping link.");
            } else {
                console.log("");
                providers.forEach((p, i) => {
                    const tag = p.label ? `${p.label} - ` : "";
                    console.log(`  ${i + 1}) ${tag}${p.domain}`);
                });
                console.log("");
                const choiceStr = await prompt(
                    `  Select [1-${providers.length}] or Enter to skip: `,
                );
                const choice = parseInt(choiceStr, 10);
                if (!isNaN(choice) && choice >= 1 && choice <= providers.length) {
                    providerId = providers[choice - 1]._id;
                    const ext = await prompt(
                        "  External user ID (e.g. JWT 'sub' value) [Enter to skip]: ",
                    );
                    if (ext) externalUserId = ext;
                }
            }
        }
    }

    const userDoc: UserDoc = {
        _id: `user-${randomUUID()}`,
        type: "user",
        email,
        name,
        memberOf: ["group-super-admins"],
        updatedTimeUtc: Date.now(),
    };
    if (providerId) userDoc.providerId = providerId;
    if (externalUserId) userDoc.externalUserId = externalUserId;

    // This script writes directly to CouchDB and so bypasses the API's
    // validateChangeRequest pipeline (including the (providerId, externalUserId)
    // uniqueness check). Replicate the key guards here so the script can't
    // silently create a duplicate that would later break login routing.
    if (providerId && externalUserId) {
        const conflictResult = await find<UserDoc>(
            { type: "user", providerId, externalUserId },
            2,
        );
        const conflicts = conflictResult.docs ?? [];
        if (conflicts.length > 0) {
            console.log("");
            console.log(
                `!! A user is already linked to provider ${providerId} with externalUserId "${externalUserId}":`,
            );
            conflicts.forEach((c) => {
                console.log(`   - _id=${c._id}, email=${c.email}, name=${c.name}`);
            });
            console.log("   Creating a duplicate will make login matching non-deterministic.");
            const override = await prompt(
                "Create anyway (not recommended)? (y/n): ",
            );
            if (override.toLowerCase() !== "y") {
                console.log("Aborted. No changes were made.");
                return;
            }
        }
    }

    const byEmailResult = await find<UserDoc>({ type: "user", email }, 5);
    const existingByEmail = byEmailResult.docs ?? [];
    if (existingByEmail.length > 0) {
        console.log("");
        console.log(
            `!! ${existingByEmail.length} existing user doc(s) already use the email "${email}":`,
        );
        existingByEmail.forEach((u) => {
            console.log(
                `   - _id=${u._id}, providerId=${u.providerId ?? "(none)"}, externalUserId=${u.externalUserId ?? "(none)"}`,
            );
        });
        console.log(
            "   On login, memberOf from all docs with this email will be merged; creating",
        );
        console.log("   another doc for the same email is rarely what you want.");
        const cont = await prompt("Continue anyway? (y/n): ");
        if (cont.toLowerCase() !== "y") {
            console.log("Aborted. No changes were made.");
            return;
        }
    }

    console.log("");
    console.log("-".repeat(60));
    console.log("  Review: Super Admin User");
    console.log("-".repeat(60));
    prettyPrint(userDoc);

    console.log("");
    const confirm = await prompt("Write this user document to CouchDB? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Aborted. No changes were made.");
        return;
    }

    const res = await putDoc(userDoc._id, userDoc);
    if (res.ok) {
        console.log(`\n  Super admin user created: ${userDoc._id}`);
    } else {
        console.log(`\n  Failed to create user: ${res.error} - ${res.reason}`);
    }
}

// ── Main Menu ───────────────────────────────────────────────────────────────────

async function main() {
    console.log("");
    console.log("=".repeat(60));
    console.log("  Luminary Auth Setup");
    console.log("=".repeat(60));
    console.log("");
    console.log("This tool sets up authentication for Luminary by creating");
    console.log("the required documents in CouchDB.");
    console.log("");
    console.log("  1) Add Auth Provider");
    console.log("     Create a new OIDC provider (e.g. Auth0, Okta) so users");
    console.log("     can log in. Also creates auto group mappings and fixes");
    console.log("     ACL permissions.");
    console.log("");
    console.log("  2) Modify Auth Provider");
    console.log("     Change the domain, client ID, claim mappings, or group");
    console.log("     mapping rules for an existing provider.");
    console.log("");
    console.log("  3) Configure Default Groups");
    console.log("     Set the groups assigned to ALL users (including guests).");
    console.log("     This controls what unauthenticated users can access.");
    console.log("");
    console.log("  4) Fix Group ACLs");
    console.log("     Ensure the seed groups (super-admins, public-users) have");
    console.log("     the right permissions for auth-related document types.");
    console.log("");
    console.log("  5) Create Super Admin User");
    console.log("     Add a user document with membership in 'group-super-admins'.");
    console.log("     Matched on login by externalUserId or email.");
    console.log("");
    console.log("  6) Full Setup");
    console.log("     Run steps 1 + 3 + 4 in sequence. Best for first-time setup.");
    console.log("");

    const menuChoice = await prompt("Select an option [1-6]: ");

    switch (menuChoice) {
        case "1":
            await addAuthProvider();
            break;
        case "2":
            await modifyAuthProvider();
            break;
        case "3":
            await configureDefaultGroups();
            break;
        case "4":
            await ensureGroupAcls();
            break;
        case "5":
            await createSuperAdminUser();
            break;
        case "6": {
            const providerId = await addAuthProvider();
            await configureDefaultGroups();
            if (!providerId) await ensureGroupAcls();
            break;
        }
        default:
            console.log("Invalid option.");
            break;
    }

    rl.close();
}

main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    rl.close();
    process.exit(1);
});
