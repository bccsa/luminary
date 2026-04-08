#!/usr/bin/env ts-node
// docker exec -it <container> npm run auth-setup
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { randomUUID } from "crypto";

// ── Types ───────────────────────────────────────────────────────────────────────

interface AuthProviderDoc {
    _id: string;
    _rev?: string;
    type: "authProvider";
    domain: string;
    audience: string;
    clientId: string;
    memberOf: string[];
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

interface AuthProviderGroupMapping {
    groupId: string;
    conditions: AuthProviderCondition[];
}

// ── Constants ───────────────────────────────────────────────────────────────────

const AUTO_MEMBER_OF = ["group-super-admins", "group-public-users"];
const AUTO_DEFAULT_GROUPS = ["group-public-users"];
const AUTO_GROUP_MAPPINGS: AuthProviderGroupMapping[] = [
    { groupId: "group-public-users", conditions: [{ type: "authenticated" }] },
];

interface AuthProviderConfigDoc {
    _id: string;
    _rev?: string;
    type: "authProviderConfig";
    providerId: string;
    memberOf: string[];
    claimNamespace?: string;
    groupMappings?: AuthProviderGroupMapping[];
    userFieldMappings?: { externalUserId?: string; email?: string; name?: string };
    updatedTimeUtc: number;
}

interface DefaultPermissionsDoc {
    _id: "defaultPermissions";
    _rev?: string;
    type: "defaultPermissions";
    memberOf: string[];
    defaultGroups: string[];
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

// ── Environment ─────────────────────────────────────────────────────────────────

const apiDir = path.resolve(__dirname);
const envPath = path.join(apiDir, ".env");

if (!fs.existsSync(envPath)) {
    console.error(`Error: .env file not found in the api directory at ${apiDir}.`);
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

// ── Group mappings collector ────────────────────────────────────────────────────

async function collectGroupMappings(): Promise<AuthProviderGroupMapping[]> {
    const mappings: AuthProviderGroupMapping[] = [];

    while (true) {
        const groupId = await prompt("  Group ID (or blank to finish): ");
        if (!groupId) break;

        console.log(`  Condition type for '${groupId}':`);
        console.log("    1) authenticated  — any successfully authenticated user");
        console.log("    2) claimEquals    — a JWT claim equals a specific value");
        console.log("    3) claimIn        — a JWT claim is one of a list of values");
        const choice = await prompt("  Select [1-3]: ");

        const condition: AuthProviderCondition = {} as AuthProviderCondition;

        switch (choice) {
            case "1":
                condition.type = "authenticated";
                break;
            case "2":
                condition.type = "claimEquals";
                condition.claimPath = await prompt("  Claim path (e.g., roles): ");
                condition.value = await prompt("  Claim value (exact match): ");
                break;
            case "3": {
                condition.type = "claimIn";
                condition.claimPath = await prompt("  Claim path (e.g., roles): ");
                console.log("  Enter values one per line. Leave blank to finish.");
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
                console.log("  Invalid choice, skipping.");
                continue;
        }

        mappings.push({ groupId, conditions: [condition] });
    }

    return mappings;
}

// ── Ensure unique array values ──────────────────────────────────────────────────

function uniqueStrings(...arrays: string[][]): string[] {
    return Array.from(new Set(arrays.flat()));
}

// ── Add Auth Provider ───────────────────────────────────────────────────────────

async function addAuthProvider(): Promise<string | null> {
    console.log("");
    console.log("=====================================");
    console.log("   Add AuthProvider to CouchDB");
    console.log("=====================================");
    console.log("");

    const domain = await prompt("Domain (e.g., yourdomain.auth0.com): ");
    if (!domain) {
        console.log("Domain is required.");
        return null;
    }

    const defaultAudience = `https://${domain}`;
    const audienceInput = await prompt(`Audience [default: ${defaultAudience}]: `);
    const audience = audienceInput || defaultAudience;

    const clientId = await prompt("Client ID: ");
    if (!clientId) {
        console.log("Client ID is required.");
        return null;
    }

    const label = await prompt("Display label (e.g., 'Sign in with Google') [optional]: ");

    console.log("");
    console.log("Additional groups this auth provider should be visible to?");
    console.log(`  Auto-included: ${AUTO_MEMBER_OF.join(", ")}`);
    console.log("  Enter additional group IDs one per line. Leave blank to finish.");
    console.log("");

    const extraGroups: string[] = [];
    while (true) {
        const group = await prompt("  Group ID (or blank to finish): ");
        if (!group) break;
        extraGroups.push(group);
    }

    const memberOf = uniqueStrings(AUTO_MEMBER_OF, extraGroups);

    console.log("");
    console.log("Custom JWT claim namespace (optional).");
    console.log("  e.g. https://yourdomain.com/metadata");
    const claimNamespace = await prompt("Claim namespace [optional]: ");

    // Derive default user field mappings from claim namespace (dot notation for nested access)
    const defaultExternalUserId = claimNamespace ? `${claimNamespace}.userId` : "sub";
    const defaultEmail = claimNamespace ? `${claimNamespace}.email` : "email";
    const defaultName = claimNamespace ? `${claimNamespace}.username` : "name";

    console.log("");
    console.log("User field mappings: JWT claim paths used to extract standard user fields.");
    if (claimNamespace) {
        console.log(`  Defaults derived from claim namespace: ${claimNamespace}`);
    }
    console.log(`  Press Enter to accept the defaults shown in brackets.`);
    const ufmExternalUserId =
        (await prompt(`  externalUserId claim [default: ${defaultExternalUserId}]: `)) ||
        defaultExternalUserId;
    const ufmEmail =
        (await prompt(`  email claim          [default: ${defaultEmail}]: `)) || defaultEmail;
    const ufmName =
        (await prompt(`  name claim           [default: ${defaultName}]: `)) || defaultName;

    console.log("");
    console.log("Group mappings: rules that assign authenticated users to local groups.");
    console.log(
        `  Auto-included: ${AUTO_GROUP_MAPPINGS.map((m) => m.groupId).join(", ")} (authenticated)`,
    );
    console.log("  Enter additional mappings one by one. Leave group ID blank to finish.");
    console.log("");
    const extraMappings = await collectGroupMappings();

    // Merge auto + extra mappings, letting extra mappings override auto ones for the same groupId
    const groupMappings = [
        ...AUTO_GROUP_MAPPINGS.filter((m) => !extraMappings.some((e) => e.groupId === m.groupId)),
        ...extraMappings,
    ];

    // Build documents
    const providerId = randomUUID();
    const now = Date.now();

    const providerDoc: AuthProviderDoc = {
        _id: providerId,
        type: "authProvider",
        domain,
        audience,
        clientId,
        memberOf,
        updatedTimeUtc: now,
    };
    if (label) providerDoc.label = label;

    const configDoc: AuthProviderConfigDoc = {
        _id: randomUUID(),
        type: "authProviderConfig",
        providerId,
        memberOf: ["group-super-admins"],
        updatedTimeUtc: now,
    };
    if (claimNamespace) configDoc.claimNamespace = claimNamespace;
    if (groupMappings.length > 0) configDoc.groupMappings = groupMappings;

    configDoc.userFieldMappings = {
        externalUserId: ufmExternalUserId,
        email: ufmEmail,
        name: ufmName,
    };

    console.log("");
    console.log("Generated AuthProvider payload:");
    prettyPrint(providerDoc);
    console.log("");
    console.log("Generated AuthProviderConfig payload:");
    prettyPrint(configDoc);
    console.log("");

    const confirm = await prompt("Proceed with insertion into CouchDB? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Aborted.");
        return null;
    }

    const providerRes = await putDoc(providerDoc._id, providerDoc);
    console.log("\nAuthProvider response from CouchDB:");
    prettyPrint(providerRes);

    const configRes = await putDoc(configDoc._id, configDoc);
    console.log("\nAuthProviderConfig response from CouchDB:");
    prettyPrint(configRes);

    // Ensure group ACLs include the auth provider doc types
    await ensureGroupAcls();

    // Backfill providerId on existing users
    console.log("");
    const backfillConfirm = await prompt(
        `Backfill providerId='${providerId}' onto all existing users? (y/n): `,
    );
    if (backfillConfirm.toLowerCase() === "y") {
        await backfillUsers(providerId);
    }

    return providerId;
}

// ── Backfill users ──────────────────────────────────────────────────────────────

async function backfillUsers(providerId: string) {
    console.log("Fetching all user documents...");

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

    console.log(`Found ${allUsers.length} user(s).`);

    if (allUsers.length === 0) return;

    let migratedUserIdCount = 0;
    const bulk = allUsers.map((u) => {
        const updated = { ...u, providerId };

        // Migrate deprecated userId → externalUserId if not already set
        if (!updated.externalUserId && updated.userId) {
            updated.externalUserId = updated.userId;
            migratedUserIdCount++;
        }

        return updated;
    });

    console.log(`Updating ${allUsers.length} user(s) with providerId='${providerId}'...`);
    if (migratedUserIdCount > 0) {
        console.log(`  Also migrating userId → externalUserId for ${migratedUserIdCount} user(s).`);
    }

    const results = await bulkDocs(bulk);
    const errors = results.filter((r) => r.error);

    if (errors.length === 0) {
        console.log(`Successfully updated ${allUsers.length} user(s).`);
    } else {
        console.log(`Completed with ${errors.length} error(s):`);
        errors.forEach((e) => console.log(JSON.stringify(e)));
    }
}

// ── Ensure group ACLs for auth provider doc types ───────────────────────────────

const REQUIRED_ACLS: { groupId: string; entries: AclEntry[] }[] = [
    {
        groupId: "group-public-users",
        entries: [{ type: "authProvider", groupId: "group-public-users", permission: ["view"] }],
    },
    {
        groupId: "group-super-admins",
        entries: [
            {
                type: "authProvider",
                groupId: "group-super-admins",
                permission: ["view", "create", "edit", "delete", "assign"],
            },
            {
                type: "authProviderConfig",
                groupId: "group-super-admins",
                permission: ["view", "create", "edit", "delete", "assign"],
            },
            {
                type: "defaultPermissions",
                groupId: "group-super-admins",
                permission: ["view", "create", "edit", "delete", "assign"],
            },
        ],
    },
];

async function ensureGroupAcls() {
    console.log("");
    console.log("Ensuring group ACLs include auth provider doc types...");

    for (const { groupId, entries } of REQUIRED_ACLS) {
        let groupDoc: GroupDoc;
        try {
            groupDoc = await getDoc<GroupDoc>(groupId);
            if ((groupDoc as any).error) {
                console.log(`  ⚠ Group '${groupId}' not found in database, skipping.`);
                continue;
            }
        } catch {
            console.log(`  ⚠ Could not fetch '${groupId}', skipping.`);
            continue;
        }

        let changed = false;
        for (const required of entries) {
            const existing = groupDoc.acl.find(
                (a) => a.type === required.type && a.groupId === required.groupId,
            );
            if (!existing) {
                groupDoc.acl.push(required);
                changed = true;
                console.log(`  + Added ${required.type} ACL to ${groupId}`);
            } else {
                // Ensure all required permissions are present
                const missing = required.permission.filter((p) => !existing.permission.includes(p));
                if (missing.length > 0) {
                    existing.permission.push(...missing);
                    changed = true;
                    console.log(
                        `  + Added missing permissions [${missing.join(", ")}] to ${
                            required.type
                        } ACL on ${groupId}`,
                    );
                }
            }
        }

        if (changed) {
            groupDoc.updatedTimeUtc = Date.now();
            const res = await putDoc(groupDoc._id, groupDoc);
            if (res.ok) {
                console.log(`  ✓ Updated ${groupId}`);
            } else {
                console.log(`  ✗ Failed to update ${groupId}: ${res.error} — ${res.reason}`);
            }
        } else {
            console.log(`  ✓ ${groupId} already has required ACLs`);
        }
    }
}

// ── Modify Auth Provider ────────────────────────────────────────────────────────

async function modifyAuthProvider() {
    console.log("");
    console.log("=====================================");
    console.log("   Modify Auth Provider");
    console.log("=====================================");
    console.log("");

    const result = await find<AuthProviderDoc>({ type: "authProvider" });
    const providers = result.docs || [];

    if (providers.length === 0) {
        console.log("No auth providers found. Use 'Add Auth Provider' to create one.");
        return;
    }

    console.log("Existing auth providers:");
    providers.forEach((p, i) => {
        const tag = p.label ? `${p.label} — ` : "";
        console.log(`  ${i + 1}) ${tag}${p.domain} (${p._id})`);
    });
    console.log("");

    const choiceStr = await prompt(`Select provider to modify [1-${providers.length}]: `);
    const choice = parseInt(choiceStr, 10);
    if (isNaN(choice) || choice < 1 || choice > providers.length) {
        console.log("Invalid selection. Exiting.");
        return;
    }

    const currentProvider = providers[choice - 1];
    const currentId = currentProvider._id;

    // Fetch associated config
    const configResult = await find<AuthProviderConfigDoc>(
        { type: "authProviderConfig", providerId: currentId },
        1,
    );
    const currentConfig = configResult.docs?.[0] || null;

    // Initialize working variables
    let domain = currentProvider.domain;
    let audience = currentProvider.audience;
    let clientId = currentProvider.clientId;
    let label = currentProvider.label || "";
    let memberOf = currentProvider.memberOf || [...AUTO_MEMBER_OF];
    let claimNamespace = currentConfig?.claimNamespace || "";
    let ufmExternalUserId =
        currentConfig?.userFieldMappings?.externalUserId ||
        (claimNamespace ? `${claimNamespace}.userId` : "sub");
    let ufmEmail =
        currentConfig?.userFieldMappings?.email ||
        (claimNamespace ? `${claimNamespace}.email` : "email");
    let ufmName =
        currentConfig?.userFieldMappings?.name ||
        (claimNamespace ? `${claimNamespace}.username` : "name");

    // Auto-fix slash-notation claim paths loaded from the database.
    // Old script versions used "namespace/field" instead of "namespace.field".
    if (claimNamespace) {
        const slashPrefix = claimNamespace + "/";
        const dotPrefix = claimNamespace + ".";
        const fixPath = (p: string) =>
            p.startsWith(slashPrefix) ? dotPrefix + p.slice(slashPrefix.length) : p;

        const fixedExt = fixPath(ufmExternalUserId);
        const fixedEmail = fixPath(ufmEmail);
        const fixedName = fixPath(ufmName);

        if (fixedExt !== ufmExternalUserId || fixedEmail !== ufmEmail || fixedName !== ufmName) {
            console.log("");
            console.log(
                "  ⚠ Detected old slash-notation in user field mappings. Auto-correcting to dot notation:",
            );
            if (fixedExt !== ufmExternalUserId)
                console.log(`    externalUserId: ${ufmExternalUserId} → ${fixedExt}`);
            if (fixedEmail !== ufmEmail) console.log(`    email: ${ufmEmail} → ${fixedEmail}`);
            if (fixedName !== ufmName) console.log(`    name: ${ufmName} → ${fixedName}`);
            ufmExternalUserId = fixedExt;
            ufmEmail = fixedEmail;
            ufmName = fixedName;
        }
    }
    let groupMappings = currentConfig?.groupMappings || [];

    console.log("");
    console.log("Select a field to edit. Changes are staged until you confirm.");
    console.log("Press Q to finish and proceed.");

    while (true) {
        console.log("");
        console.log(`  1) Domain              [${domain}]`);
        console.log(`  2) Audience            [${audience}]`);
        console.log(`  3) Client ID           [${clientId}]`);
        console.log(`  4) Display label       [${label}]`);
        console.log(`  5) Member-of groups    [${JSON.stringify(memberOf)}]`);
        console.log(`  6) Claim namespace     [${claimNamespace}]`);
        console.log(
            `  7) User field mappings [externalUserId=${ufmExternalUserId || "sub"}, email=${
                ufmEmail || "email"
            }, name=${ufmName || "name"}]`,
        );
        console.log(`  8) Group mappings      (${groupMappings.length} mapping(s))`);
        console.log("  Q) Done — proceed to update");
        console.log("");

        const fieldChoice = await prompt("Select [1-8 or Q]: ");

        switch (fieldChoice) {
            case "1": {
                const v = await prompt(`Domain [${domain}]: `);
                if (v) domain = v;
                break;
            }
            case "2": {
                const v = await prompt(`Audience [${audience}]: `);
                if (v) audience = v;
                break;
            }
            case "3": {
                const v = await prompt(`Client ID [${clientId}]: `);
                if (v) clientId = v;
                break;
            }
            case "4": {
                const v = await prompt(
                    `Display label [${label}] (enter a single space to clear): `,
                );
                if (v === " ") label = "";
                else if (v) label = v;
                break;
            }
            case "5": {
                console.log(`  Current: ${JSON.stringify(memberOf)}`);
                console.log(`  Auto-included: ${AUTO_MEMBER_OF.join(", ")}`);
                console.log("  Enter additional group IDs one per line. Leave blank to finish.");
                console.log("  (Entering nothing keeps the current value.)");
                console.log("");
                const newExtra: string[] = [];
                let entered = false;
                while (true) {
                    const g = await prompt("  Group ID (or blank to finish): ");
                    if (!g) break;
                    newExtra.push(g);
                    entered = true;
                }
                if (entered) {
                    memberOf = uniqueStrings(AUTO_MEMBER_OF, newExtra);
                }
                break;
            }
            case "6": {
                const v = await prompt(
                    `Claim namespace [${claimNamespace}] (enter a single space to clear): `,
                );
                const oldNs = claimNamespace;
                if (v === " ") claimNamespace = "";
                else if (v) claimNamespace = v;

                if (claimNamespace !== oldNs) {
                    const derivedExternalUserId = claimNamespace
                        ? `${claimNamespace}.userId`
                        : "sub";
                    const derivedEmail = claimNamespace ? `${claimNamespace}.email` : "email";
                    const derivedName = claimNamespace ? `${claimNamespace}.username` : "name";
                    const rederive = await prompt(
                        `  Update user field mappings to [${derivedExternalUserId}, ${derivedEmail}, ${derivedName}]? (y/n): `,
                    );
                    if (rederive.toLowerCase() === "y") {
                        ufmExternalUserId = derivedExternalUserId;
                        ufmEmail = derivedEmail;
                        ufmName = derivedName;
                    }
                }
                break;
            }
            case "7": {
                console.log(
                    `  Current: externalUserId=${ufmExternalUserId || "sub"}, email=${
                        ufmEmail || "email"
                    }, name=${ufmName || "name"}`,
                );
                console.log(
                    "  Press Enter to keep current. Enter a single space to clear a field.",
                );
                let v = await prompt(`  externalUserId claim [${ufmExternalUserId}]: `);
                if (v === " ") ufmExternalUserId = "";
                else if (v) ufmExternalUserId = v;
                v = await prompt(`  email claim [${ufmEmail}]: `);
                if (v === " ") ufmEmail = "";
                else if (v) ufmEmail = v;
                v = await prompt(`  name claim [${ufmName}]: `);
                if (v === " ") ufmName = "";
                else if (v) ufmName = v;
                break;
            }
            case "8": {
                console.log("  Current group mappings:");
                prettyPrint(groupMappings);
                console.log("");
                const replace = await prompt("  Replace all group mappings? (y/n): ");
                if (replace.toLowerCase() === "y") {
                    console.log("  Enter new group mappings. Leave group ID blank to finish.");
                    console.log("");
                    groupMappings = await collectGroupMappings();
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

    // Validate required fields
    if (!domain) {
        console.log("Domain is required. Aborting.");
        return;
    }
    if (!audience) {
        console.log("Audience is required. Aborting.");
        return;
    }
    if (!clientId) {
        console.log("Client ID is required. Aborting.");
        return;
    }

    // Ensure auto-included groups are present
    memberOf = uniqueStrings(AUTO_MEMBER_OF, memberOf);

    const now = Date.now();

    // Build updated provider doc — preserves imageData, imageBucketId, etc.
    const providerDoc: AuthProviderDoc = {
        ...currentProvider,
        domain,
        audience,
        clientId,
        memberOf,
        updatedTimeUtc: now,
    };
    if (label) providerDoc.label = label;
    else delete providerDoc.label;

    // Build updated config doc
    const configBase: AuthProviderConfigDoc = currentConfig || {
        _id: randomUUID(),
        type: "authProviderConfig",
        providerId: currentId,
        memberOf: ["group-super-admins"],
        updatedTimeUtc: now,
    };
    const configDoc: AuthProviderConfigDoc = {
        ...configBase,
        memberOf: ["group-super-admins"],
        updatedTimeUtc: now,
    };

    if (claimNamespace) configDoc.claimNamespace = claimNamespace;
    else delete configDoc.claimNamespace;

    if (groupMappings.length > 0) configDoc.groupMappings = groupMappings;
    else delete configDoc.groupMappings;

    configDoc.userFieldMappings = {
        externalUserId: ufmExternalUserId,
        email: ufmEmail,
        name: ufmName,
    };

    console.log("");
    console.log("Updated AuthProvider payload:");
    prettyPrint(providerDoc);
    console.log("");
    console.log("Updated AuthProviderConfig payload:");
    prettyPrint(configDoc);
    console.log("");

    const confirm = await prompt("Proceed with update in CouchDB? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
    }

    const providerRes = await putDoc(providerDoc._id, providerDoc);
    console.log("\nAuthProvider response from CouchDB:");
    prettyPrint(providerRes);

    const configRes = await putDoc(configDoc._id, configDoc);
    console.log("\nAuthProviderConfig response from CouchDB:");
    prettyPrint(configRes);
}

// ── Configure Default Groups ────────────────────────────────────────────────────

async function configureDefaultGroups() {
    console.log("");
    console.log("=====================================");
    console.log("   Configure Default Groups");
    console.log("=====================================");
    console.log("");
    console.log("Default groups are automatically assigned to ALL users (including guests).");
    console.log("They are stored in a DefaultPermissions document in CouchDB.");
    console.log("");
    console.log(`Auto-included: ${AUTO_DEFAULT_GROUPS.join(", ")}`);
    console.log("Enter additional default group IDs, one per line. Leave blank to finish.");
    console.log("");

    const extraGroups: string[] = [];
    while (true) {
        const groupId = await prompt("  Group ID (or blank to finish): ");
        if (!groupId) break;
        extraGroups.push(groupId);
    }

    const defaultGroups = uniqueStrings(AUTO_DEFAULT_GROUPS, extraGroups);

    console.log("");
    console.log(`Default groups to set: ${defaultGroups.join(", ")}`);
    console.log("");

    // Check for existing document
    let existingDoc: DefaultPermissionsDoc | null = null;
    try {
        const doc = await getDoc<DefaultPermissionsDoc & { error?: string }>("defaultPermissions");
        if (!doc.error) existingDoc = doc;
    } catch {
        // Document doesn't exist
    }

    const now = Date.now();

    if (existingDoc?._rev) {
        console.log(`Existing DefaultPermissions document found (rev: ${existingDoc._rev}).`);
        const overwrite = await prompt("Overwrite defaultGroups? (y/n): ");
        if (overwrite.toLowerCase() !== "y") {
            console.log("Skipping DefaultPermissions update.");
            return;
        }
    } else {
        console.log("No existing DefaultPermissions document found. Creating a new one.");
    }

    const dpDoc: DefaultPermissionsDoc = {
        _id: "defaultPermissions",
        type: "defaultPermissions",
        memberOf: ["group-super-admins"],
        defaultGroups,
        updatedTimeUtc: now,
        ...(existingDoc?._rev ? { _rev: existingDoc._rev } : {}),
    };

    const response = await putDoc("defaultPermissions", dpDoc);
    console.log("\nDefaultPermissions response from CouchDB:");
    prettyPrint(response);
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
    console.log("=====================================");
    console.log("   Luminary Auth Setup");
    console.log("=====================================");
    console.log("");
    console.log("  1) Add Auth Provider");
    console.log("  2) Modify Auth Provider");
    console.log("  3) Configure Default Groups");
    console.log("  4) Fix Group ACLs (add auth provider permissions)");
    console.log("  5) Full Setup (Add Provider + Default Groups + Fix ACLs)");
    console.log("");

    const menuChoice = await prompt("Select an option [1-5]: ");

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
        case "5": {
            const result = await addAuthProvider();
            await configureDefaultGroups();
            if (!result) await ensureGroupAcls();
            break;
        }
        default:
            console.log("Invalid option. Exiting.");
            break;
    }

    rl.close();
}

main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    rl.close();
    process.exit(1);
});
