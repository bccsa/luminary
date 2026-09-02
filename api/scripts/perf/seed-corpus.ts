import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { computeFtsData } from "../../src/util/ftsIndexing";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Build a throwaway database with a synthetic corpus, so the audit can be re-run at
 * several corpus sizes and show which requests degrade linearly and which fall off a
 * cliff. Never writes to an existing database: the target must not already exist unless
 * `--recreate` is passed.
 */

type Args = {
    couchUrl: string;
    db: string;
    posts: number;
    languages: number;
    tags: number;
    groups: number;
    recreate: boolean;
};

const WORDS = `access account action active advance affair agency amount animal answer appeal
approach article attempt balance benefit bridge budget capital career century channel chapter
climate comfort command comment company concept concern content context council country courage
culture current dealer decade defence deliver density deposit desire detail device digital
display distance district drawing driver economy edition effort element energy engine english
episode equally evening evidence example exchange exercise expense explain express extreme
faculty failure feature federal feeling fiction figure finance finding fitness flavour foreign
formal fortune forward founder freedom friend future gallery garden gather general genuine
gesture glance golden gospel govern gradual grant ground growth habitat handle harbour harvest
healthy hearing heaven height heritage highway history holiday honest horizon hospital housing
humour hunger ideal imagine impact import improve include income indeed indoor initial injury
inquiry insight inspire install instant intense invest island journal journey justice kingdom
kitchen knowledge landscape language lasting laughter leading learning leather lecture legacy
liberty library licence lifetime lighting limited listen literary machine magazine maintain
majority manage marine market master matter meaning measure medical meeting memory mention
message method middle mineral minute mission mixture mobile modern moment monitor morning
motion mountain movement musical mystery narrow nation native natural nearby network neutral
notable notice novel nuclear number object observe obtain occasion offer office official
operate opinion option orange order organic origin outcome outdoor outline output overall
package parent partial partner passage patient pattern payment peaceful perfect perform period
permit person picture pioneer planet plastic pleasure poetry policy portion positive possible
poster potential powder practice praise precise predict prefer premium prepare present pressure
pretty prevent primary printer private problem process produce profile program project promise
prompt proper protect proud provide public publish purpose quality quarter question quickly
radical railway rainbow random rapidly rather reading reality reason recall receive recent
record recover reduce reflect reform refuse regard region regular reject relate release relief
remain remark remote remove render repair repeat replace report request require rescue reserve
resist resolve resort resource respect respond restore result retain return reveal review
reward rhythm ribbon rising rocket romance routine royal running sacred safety salary sample
satisfy saving scatter scheme scholar science scratch screen script season second secret
section secure select senior sense sensor sentence series serious service session settle
several severe shadow shallow shelter shift shining shortly should shoulder signal silent
silver similar simple singer single sister situate sketch slight slowly smooth social society
soldier solid solution somehow sorry source special species specify speech spirit sponsor
spread spring square stable staff stage standard station status steady sterling storage story
strange stream street strength stretch strike strong studio subject submit succeed sudden
suffer suggest summer summit supply support suppose surface surgery surplus survey survive
suspect sustain switch symbol system tackle talent target teacher technical telephone
temperature tender tension terrain terrible theatre theory therapy thinking thought thread
threat thrive through ticket timber tissue title tobacco together tomorrow tonight topic
totally touch tourist toward trace trade traffic tragedy trail train transfer transit travel
treaty trend trial tribute trigger trouble trust truth tunnel turnover typical ultimate unable
uncle underline uniform unique united universe unless unusual update upgrade upper urban urgent
useful usual utility vacuum valley value vanish variety various vehicle velvet vendor venture
verbal verdict version vertical vessel veteran victim victory village violent virtual virtue
visible vision visit visual vital voice volume voyage waiting walking wander warning warrior
watch water weather website welcome welfare western whatever wheel whereas whether whisper
wholly widely willing window winner winter wisdom within without witness wonder wooden worker
working worry worship worth writer writing yellow yesterday yield young`
    .split(/\s+/)
    .filter(Boolean);

/** fetch() rejects URLs carrying credentials, so they move into a Basic auth header. */
let authHeader: string | undefined;

async function main() {
    const args = parseArgs();
    const url = new URL(args.couchUrl);
    if (url.username || url.password) {
        const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(
            url.password,
        )}`;
        authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
        url.username = "";
        url.password = "";
    }
    const base = `${url.toString().replace(/\/+$/, "")}/${encodeURIComponent(args.db)}`;

    if (!/perf|test|bench/i.test(args.db)) {
        throw new Error(
            `Refusing to seed "${args.db}": the target database name must contain "perf", "test" or "bench". ` +
                `This script only ever writes to a throwaway database.`,
        );
    }

    const exists = (await fetch(base, { headers: headers() })).ok;
    if (exists && !args.recreate) {
        throw new Error(
            `Database "${args.db}" already exists. Pass --recreate to drop and rebuild it.`,
        );
    }
    if (exists) {
        console.log(`Dropping ${args.db}…`);
        await request("DELETE", base);
    }

    console.log(`Creating ${args.db}…`);
    await request("PUT", base);

    console.log("Pushing design docs…");
    const designDir = path.resolve(__dirname, "../../src/db/designDocs");
    for (const file of fs.readdirSync(designDir).filter((f) => f.endsWith(".json"))) {
        const doc = JSON.parse(fs.readFileSync(path.join(designDir, file), "utf8"));
        await request("PUT", `${base}/${encodeURIComponent(doc._id)}`, doc);
    }

    const docs = generateDocs(args);
    console.log(`Writing ${docs.length} documents…`);
    for (let i = 0; i < docs.length; i += 500) {
        const batch = docs.slice(i, i + 500);
        await request("POST", `${base}/_bulk_docs`, { docs: batch });
        process.stdout.write(`\r  ${Math.min(i + 500, docs.length)}/${docs.length}`);
    }
    process.stdout.write("\n");

    console.log("Building view indexes (first read pays this otherwise)…");
    for (const view of [
        "fts-trigram-index",
        "fts-corpus-stats",
        "sync-content-index",
        "content-publishDate-index",
    ]) {
        await fetch(`${base}/_design/${view}/_view/${view}?limit=1`, { headers: headers() }).catch(
            () => undefined,
        );
    }

    console.log("");
    console.log(`Seeded ${args.db}. Run the audit against it with:`);
    console.log(`  DB_DATABASE=${args.db} PERF_TRACE=true npm run start:dev`);
    console.log(`  npm run perf:audit -- --db=${args.db}`);
}

function generateDocs(args: Args): any[] {
    const now = Date.now();
    const docs: any[] = [];

    const groupIds = Array.from({ length: args.groups }, (_, i) => `perf-group-${i}`);
    const languageIds = Array.from({ length: args.languages }, (_, i) => `perf-lang-${i}`);
    const tagIds = Array.from({ length: args.tags }, (_, i) => `perf-tag-${i}`);

    // A single ACL granting every permission to every doc type keeps the corpus readable by
    // the anonymous identity, so the audit measures query cost rather than permission denial.
    for (const [i, id] of groupIds.entries()) {
        docs.push({
            _id: id,
            type: "group",
            name: `Perf group ${i}`,
            updatedTimeUtc: now,
            acl: ["post", "tag", "content", "language", "group", "redirect"].map((type) => ({
                type,
                groupId: id,
                permission: ["view", "edit", "delete", "assign", "translate", "publish", "cmsView"],
            })),
        });
    }

    docs.push({
        _id: "perf-auto-group-mappings",
        type: "autoGroupMappings",
        providerId: "",
        groupIds,
        conditions: [],
        memberOf: [groupIds[0]],
        updatedTimeUtc: now,
    });

    for (const [i, id] of languageIds.entries()) {
        docs.push({
            _id: id,
            type: "language",
            memberOf: [groupIds[0]],
            languageCode: `pf-${i}`,
            name: `Perf language ${i}`,
            default: i === 0 ? 1 : 0,
            updatedTimeUtc: now,
        });
    }

    for (const [i, id] of tagIds.entries()) {
        docs.push({
            _id: id,
            type: "tag",
            memberOf: [groupIds[i % groupIds.length]],
            tagType: i % 2 === 0 ? "category" : "topic",
            pinned: i % 10 === 0 ? 1 : 0,
            tags: [],
            updatedTimeUtc: now,
        });
    }

    for (let p = 0; p < args.posts; p++) {
        const postId = `perf-post-${p}`;
        const memberOf = [groupIds[p % groupIds.length]];
        const postTags = [tagIds[p % tagIds.length], tagIds[(p + 3) % tagIds.length]].filter(
            Boolean,
        );

        docs.push({
            _id: postId,
            type: "post",
            memberOf,
            tags: postTags,
            postType: "blog",
            publishDateVisible: true,
            updatedTimeUtc: now - p * 1000,
        });

        const availableTranslations = languageIds;
        for (const [l, language] of languageIds.entries()) {
            const title = `${capitalize(word(p * 7 + l))} ${word(p * 11 + l)} ${word(p * 13 + l)}`;
            const summary = sentence(p + l, 20);
            const text = `<p>${sentence(p * 3 + l, 220)}</p>`;
            const fts = computeFtsData({ title, summary, text, author: `Author ${p % 50}` });

            docs.push({
                _id: `perf-content-${p}-${l}`,
                type: "content",
                memberOf,
                parentId: postId,
                parentType: "post",
                parentTags: postTags,
                parentTagType: null,
                parentPinned: p % 20 === 0 ? 1 : 0,
                parentPostType: "blog",
                parentPublishDateVisible: true,
                parentAlwaysOffline: p % 25 === 0,
                language,
                status: "published",
                slug: `perf-${p}-${l}`,
                title,
                summary,
                author: `Author ${p % 50}`,
                text,
                publishDate: now - p * 3_600_000,
                availableTranslations,
                updatedTimeUtc: now - p * 1000 - l,
                ...(fts ? { fts: fts.fts, ftsTokenCount: fts.ftsTokenCount } : {}),
            });
        }
    }

    return docs;
}

function word(seed: number): string {
    return WORDS[Math.abs(seed * 2654435761) % WORDS.length];
}

function sentence(seed: number, length: number): string {
    return Array.from({ length }, (_, i) => word(seed * 31 + i)).join(" ");
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function headers(json = false): Record<string, string> {
    return {
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(authHeader ? { Authorization: authHeader } : {}),
    };
}

async function request(method: string, url: string, body?: unknown) {
    const res = await fetch(url, {
        method,
        headers: headers(!!body),
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 412) {
        throw new Error(`${method} ${url} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return res;
}

function parseArgs(): Args {
    const flags: Record<string, string | boolean> = {};
    for (const arg of process.argv.slice(2)) {
        if (!arg.startsWith("--")) continue;
        const [key, ...rest] = arg.slice(2).split("=");
        flags[key] = rest.length ? rest.join("=") : true;
    }
    const int = (key: string, fallback: number) => {
        const parsed = parseInt(String(flags[key] ?? ""), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
        couchUrl: String(
            flags.couch ?? process.env.DB_CONNECTION_STRING ?? "http://localhost:5984",
        ).replace(/\/+$/, ""),
        db: String(flags.db ?? "luminary-perf"),
        posts: int("posts", 2000),
        languages: int("languages", 3),
        tags: int("tags", 50),
        groups: int("groups", 5),
        recreate: flags.recreate === true || flags.recreate === "true",
    };
}

main().catch((err) => {
    console.error(`\n${err?.message ?? err}`);
    process.exit(1);
});
