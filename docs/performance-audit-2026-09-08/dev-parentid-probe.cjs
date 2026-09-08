const https = require("https");
const zlib = require("zlib");
const HOST = "api.dev.app.bcc.africa";
const agent = new https.Agent({ keepAlive: true });
const NOW = Date.now();

function q(body) {
    return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json", "accept-encoding": "br, gzip" } }, (res) => {
            const ttfb = performance.now() - t0;
            const c = []; res.on("data", (x) => c.push(x));
            res.on("end", () => {
                const total = performance.now() - t0;
                const buf = Buffer.concat(c);
                const enc = res.headers["content-encoding"];
                const dec = enc === "br" ? zlib.brotliDecompressSync(buf) : enc === "gzip" ? zlib.gunzipSync(buf) : buf;
                let j; try { j = JSON.parse(dec.toString()); } catch { j = {}; }
                resolve({ status: res.statusCode, ttfb, total, docs: (j.docs || []).length, warning: j.warning, trace: res.headers["x-perf-trace"] });
            });
        });
        r.on("error", reject); r.setTimeout(120000, () => r.destroy(new Error("timeout")));
        r.write(JSON.stringify(body)); r.end();
    });
}

const PID = "AC-Topic-108210";
const full = {
    selector: { $and: [
        { type: "content" }, { parentType: "tag" }, { parentId: PID }, { status: "published" },
        { $or: [{ publishDate: { $lte: NOW } }, { parentShowComingSoon: true }] },
        { $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: NOW } }] },
        { $or: [{ language: "lang-eng" }, { language: "14d07c30-f0a2-4d79-b37b-a957c64859f6" }] },
        { $or: [{ publishDate: { $lte: NOW } }, { parentAlwaysOffline: true }] },
    ] },
    identifier: "hybridQuery", limit: 16, sort: [{ publishDate: "desc" }], use_index: "content-parentId-publishDate-index",
};
const bare = { selector: { $and: [{ type: "content" }, { parentId: PID }] }, identifier: "hybridQuery", limit: 16, sort: [{ publishDate: "desc" }], use_index: "content-parentId-publishDate-index" };
const bareNoIdx = { selector: { $and: [{ type: "content" }, { parentId: PID }] }, identifier: "hybridQuery", limit: 16, sort: [{ publishDate: "desc" }] };
const fullNoIdx = { ...full, use_index: undefined };
delete fullNoIdx.use_index;

(async () => {
    for (const [name, body] of [["FULL (as app sends)", full], ["FULL no use_index", fullNoIdx], ["bare parentId +pin", bare], ["bare parentId no pin", bareNoIdx]]) {
        const runs = [];
        for (let i = 0; i < 5; i++) {
            const r = await q(body);
            runs.push(r);
            console.log(`  ${name.padEnd(22)} #${i} ${r.status}  ${r.docs} docs  ttfb ${r.ttfb.toFixed(0)}ms  total ${r.total.toFixed(0)}ms  ${r.warning ? "WARN:" + r.warning.split("\n")[0] : ""}  ${r.trace || ""}`);
        }
        console.log("");
    }
    agent.destroy();
})().catch((e) => { console.error(e); agent.destroy(); process.exit(1); });
