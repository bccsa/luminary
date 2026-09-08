const https = require("https");
const zlib = require("zlib");
const agent = new https.Agent({ keepAlive: true, maxSockets: 64 });
const HOST = "api.dev.app.bcc.africa";

function q(body) {
    return new Promise((resolve, reject) => {
        const t = performance.now();
        const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json", "accept-encoding": "gzip" } }, (rs) => {
            const c = []; rs.on("data", (x) => c.push(x));
            rs.on("end", () => {
                const b = Buffer.concat(c);
                const d = rs.headers["content-encoding"] === "gzip" ? zlib.gunzipSync(b) : b;
                let j = {}; try { j = JSON.parse(d.toString()); } catch {}
                resolve({ ms: performance.now() - t, status: rs.statusCode, docs: (j.docs || []).length, warn: j.warning ? j.warning.split("\n")[0] : null });
            });
        });
        r.on("error", reject); r.setTimeout(90000, () => r.destroy(new Error("timeout")));
        r.write(JSON.stringify(body)); r.end();
    });
}

const slug = { selector: { $and: [{ type: "content" }, { slug: "armor-of-god" }] }, use_index: "content-slug-publishDate-index", sort: [{ publishDate: "desc" }], limit: 1, identifier: "hybridQuery" };
const lang = { selector: { type: "language" }, limit: 5, identifier: "sync" };

(async () => {
    const raw = await new Promise((res) => { const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 25, identifier: "sync" })); r.end(); });
    const ids = raw.docs.map((d) => d._id);
    const idlist = { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, limit: 25, identifier: "hybridQuery" };

    console.log("SEQUENTIAL _id:{$in} x25 (is the fan-out live? live => warn=none):");
    for (let i = 0; i < 4; i++) { const r = await q(idlist); console.log(`  #${i} ${r.status} ${r.docs}d ${r.ms.toFixed(0)}ms  warn=${r.warn ? "YES-SCAN" : "none"}`); }

    console.log("\nCONCURRENT burst — 8 slug + 6 id-list + 6 language, all at once:");
    const t = performance.now();
    const burst = [
        ...Array(8).fill(0).map(() => q(slug)),
        ...Array(6).fill(0).map(() => q(idlist)),
        ...Array(6).fill(0).map(() => q(lang)),
    ];
    const rs = await Promise.all(burst);
    console.log(`  wall ${((performance.now() - t) / 1000).toFixed(1)}s`);
    console.log(`  slug     : ${rs.slice(0, 8).map((r) => (r.ms / 1000).toFixed(1)).join(", ")}`);
    console.log(`  id-list  : ${rs.slice(8, 14).map((r) => (r.ms / 1000).toFixed(1)).join(", ")}`);
    console.log(`  language : ${rs.slice(14).map((r) => (r.ms / 1000).toFixed(1)).join(", ")}`);
    agent.destroy();
})().catch((e) => { console.error(e); agent.destroy(); process.exit(1); });
