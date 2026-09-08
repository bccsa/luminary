/**
 * Before/after check for a branch deployed to dev (api.dev.app.bcc.africa).
 * Run once before the deploy, once after; diff the two outputs.
 *
 *   node docs/performance-audit-2026-09-08/dev-deploy-check.cjs
 *
 * Validates §2 (id-list per-id fan-out — api/src/util/queryIdFanout.ts): the
 * `_id: {$in}` shape should drop from a ~500 ms partition scan to tens of ms with
 * the scan warning gone. §1 (tag index) is a client-side change and is NOT tested
 * by an API-only deploy — the tag rows here just confirm no regression. The sorted
 * multi-parent 500 needs #1818, not this branch.
 */
const https = require("https");
const zlib = require("zlib");
const crypto = require("crypto");
const HOST = process.env.DEV_HOST || "api.dev.app.bcc.africa";
const agent = new https.Agent({ keepAlive: true });
const SAMPLES = 20;

function req(body) {
    return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json", "accept-encoding": "br, gzip" } }, (res) => {
            const ttfb = performance.now() - t0;
            const chunks = []; res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const total = performance.now() - t0;
                const buf = Buffer.concat(chunks);
                const enc = res.headers["content-encoding"];
                const dec = enc === "br" ? zlib.brotliDecompressSync(buf) : enc === "gzip" ? zlib.gunzipSync(buf) : buf;
                let j; try { j = JSON.parse(dec.toString()); } catch { j = {}; }
                const docs = j.docs || [];
                resolve({ status: res.statusCode, ttfb, total, warning: !!j.warning, docs: docs.length, hash: crypto.createHash("sha256").update(JSON.stringify(docs.map((d) => d._id))).digest("hex").slice(0, 10), trace: res.headers["x-perf-trace"] });
            });
        });
        r.on("error", reject); r.setTimeout(30000, () => r.destroy(new Error("timeout")));
        r.write(JSON.stringify(body)); r.end();
    });
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];

async function bench(label, body) {
    for (let i = 0; i < 3; i++) await req(body);
    const rs = []; for (let i = 0; i < SAMPLES; i++) rs.push(await req(body));
    const t = rs.map((r) => r.ttfb);
    let trace = ""; try { const p = JSON.parse(rs[rs.length - 1].trace); trace = ` finds=${p.db.find} examined=${p.m.examined}`; } catch {}
    console.log(
        label.padEnd(34) +
        ` ${String(rs[0].status)}  docs ${String(rs[0].docs).padStart(3)}` +
        `  ttfb ${med(t).toFixed(0).padStart(4)}ms (p95 ${p95(t).toFixed(0).padStart(4)})` +
        `  total ${med(rs.map((r) => r.total)).toFixed(0).padStart(4)}ms` +
        `  warn ${rs.filter((r) => r.warning).length}/${SAMPLES}` +
        `  hash ${[...new Set(rs.map((r) => r.hash))].join(",")}` + trace,
    );
}

(async () => {
    const sample = await new Promise((res, rej) => { const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.on("error", rej); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 100, identifier: "sync" })); r.end(); });
    const ids = sample.docs.map((d) => d._id);
    const parentIds = [...new Set(sample.docs.map((d) => d.parentId).filter(Boolean))];
    console.log(`host ${HOST} — ${sample.docs.length} sample docs, ${ids.length} ids, ${parentIds.length} parentIds\n`);

    console.log("── §2 id-list (the fix under test) ──");
    await bench("_id:{$in} x25", { selector: { $and: [{ type: "content" }, { _id: { $in: ids.slice(0, 25) } }] }, limit: 25, identifier: "hybridQuery" });
    await bench("_id:{$in} x60", { selector: { $and: [{ type: "content" }, { _id: { $in: ids.slice(0, 60) } }] }, limit: 60, identifier: "hybridQuery" });

    console.log("\n── controls (must not regress) ──");
    await bench("slug lookup", { selector: { $and: [{ type: "content" }, { slug: sample.docs[0].slug }] }, use_index: "content-slug-publishDate-index", sort: [{ publishDate: "desc" }], limit: 1, identifier: "hybridQuery" });
    await bench("single parentId", { selector: { $and: [{ type: "content" }, { parentId: parentIds[0] }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" });
    await bench("empty incremental", { selector: { $and: [{ type: "content" }, { parentType: "post" }, { updatedTimeUtc: { $lte: 1, $gte: 0 } }] }, use_index: "sync-content-index", sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" });

    console.log("\n── §1 tag index A/B (client-side change; shown for reference) ──");
    const tb = { selector: { type: "content", parentType: "tag", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng"] } }, sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" };
    await bench("tag sync — sync-content-index", { ...tb, use_index: "sync-content-index" });
    await bench("tag sync — sync-tag-content-index", { ...tb, use_index: "sync-tag-content-index" });

    console.log("\n── #1818 (not in this branch) ──");
    await bench("multi-parent $in +sort x40", { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds.slice(0, 40) } }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" });

    agent.destroy();
})().catch((e) => { console.error(e); agent.destroy(); process.exit(1); });
