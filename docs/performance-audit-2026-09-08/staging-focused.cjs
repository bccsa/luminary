const https = require("https");
const zlib = require("zlib");
const crypto = require("crypto");
const HOST = "api.staging.app.bcc.africa";
const agent = new https.Agent({ keepAlive: true });

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
                resolve({ status: res.statusCode, ttfb, transfer: total - ttfb, total, wire: buf.length, decoded: dec.length, docs: docs.length, warning: j.warning, hash: crypto.createHash("sha256").update(JSON.stringify(docs.map((d) => d._id))).digest("hex").slice(0, 10) });
            });
        });
        r.on("error", reject); r.setTimeout(30000, () => r.destroy(new Error("timeout")));
        r.write(JSON.stringify(body)); r.end();
    });
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];

async function abPair(label, A, B, n = 15) {
    await req(A); await req(B);
    const rows = { A: [], B: [] };
    for (let i = 0; i < n; i++) {
        const order = i % 2 === 0 ? ["A", "B"] : ["B", "A"];
        for (const k of order) rows[k].push(await req(k === "A" ? A : B));
    }
    console.log(`\n${label}`);
    for (const [k, r] of Object.entries(rows)) {
        const t = r.map((x) => x.ttfb), tot = r.map((x) => x.total);
        console.log(`  ${k === "A" ? A.use_index || "(no pin)" : B.use_index || "(no pin)"}`.padEnd(38) +
            ` status ${r[0].status}  docs ${String(r[0].docs).padStart(3)}  ttfb ${med(t).toFixed(0).padStart(4)}ms (p95 ${p95(t).toFixed(0)})  total ${med(tot).toFixed(0).padStart(4)}ms  warn ${r.filter((x) => x.warning).length}/${n}  hash ${[...new Set(r.map((x) => x.hash))].join(",")}`);
    }
}

(async () => {
    // discover ids/parentIds from a plain sample
    const sample = await new Promise((res, rej) => { const r = https.request({ host: HOST, path: "/query", method: "POST", agent, headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.on("error", rej); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 100, identifier: "sync" })); r.end(); });
    const ids = sample.docs.slice(0, 25).map((d) => d._id);
    const parentIds = [...new Set(sample.docs.map((d) => d.parentId).filter(Boolean))].slice(0, 40);
    console.log(`discovered ${sample.docs.length} docs, ${ids.length} ids, ${parentIds.length} parentIds`);

    const tagBase = { selector: { type: "content", parentType: "tag", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng"] } }, sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" };
    await abPair("§1  Tag initial sync (100 docs) — index A/B",
        { ...tagBase, use_index: "sync-content-index" },
        { ...tagBase, use_index: "sync-tag-content-index" });

    // §2 id-list: fix is server-side & not deployed — measure current cost only
    await abPair("§2  id-list  _id:{$in} x25  (fix NOT deployed — both are the current scan)",
        { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, limit: 25, identifier: "hybridQuery" },
        { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, limit: 25, identifier: "hybridQuery" });

    // §3 multi-parent: sorted (what the app sends) vs unsorted (catalogue shape)
    await abPair("§3  multi-parent parentId:{$in} x40 — sorted vs unsorted (#1818 not deployed)",
        { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds } }] }, use_index: "content-parentId-publishDate-index", limit: 50, identifier: "hybridQuery" },
        { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds } }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" });

    agent.destroy();
})().catch((e) => { console.error(e); agent.destroy(); process.exit(1); });
