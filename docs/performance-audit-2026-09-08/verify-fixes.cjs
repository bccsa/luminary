const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const BASE = "http://localhost:3100";
function post(body) {
    return new Promise((resolve, reject) => {
        const t = performance.now();
        const r = http.request(new URL("/query", BASE), { method: "POST", headers: { "content-type": "application/json", "accept-encoding": "br" } }, (res) => {
            const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => {
                const ms = performance.now() - t;
                let dec = Buffer.concat(c); try { dec = zlib.brotliDecompressSync(dec); } catch {}
                let j; try { j = JSON.parse(dec.toString()); } catch { j = {}; }
                let tr; try { tr = JSON.parse(res.headers["x-perf-trace"]); } catch { tr = {}; }
                const docs = j.docs || [];
                resolve({ status: res.statusCode, ms, n: docs.length, warning: j.warning, trace: tr, hash: crypto.createHash("sha256").update(JSON.stringify(docs.map((d) => d._id).sort())).digest("hex").slice(0, 12) });
            });
        });
        r.on("error", reject); r.write(JSON.stringify(body)); r.end();
    });
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function bench(label, body, n = 15) {
    for (let i = 0; i < 3; i++) await post(body);
    const rs = []; for (let i = 0; i < n; i++) rs.push(await post(body));
    const t = rs[rs.length - 1].trace;
    console.log(`${label.padEnd(42)} ${String(rs[0].status)}  ${String(rs[0].n).padStart(3)} docs  ${med(rs.map((r) => r.ms)).toFixed(1).padStart(7)}ms  find×${t.db?.find}  examined ${String(t.m?.examined).padStart(5)}  warn ${rs.filter((r) => r.warning).length}/${n}  hash ${rs[0].hash}`);
    return rs[0];
}
(async () => {
    const raw = await post({ selector: { type: "content", parentType: "tag" }, limit: 5, identifier: "sync" });
    // tag sync — both indexes
    const base = { selector: { type: "content", parentType: "tag", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng", "lang-fra"] } }, sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" };
    console.log("\n── §1 tag initial sync (100) ──");
    await bench("use_index sync-content-index (old)", { ...base, use_index: "sync-content-index" });
    await bench("use_index sync-tag-content-index (new)", { ...base, use_index: "sync-tag-content-index" });

    console.log("\n── §2 id-list supplement ──");
    const cids = (await post({ selector: { type: "content", parentType: "post" }, limit: 25, identifier: "sync" }));
    const idsRaw = await new Promise((res) => { const r = http.request(new URL("/query", BASE), { method: "POST", headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 25, identifier: "sync" })); r.end(); });
    const ids = idsRaw.docs.map((d) => d._id);
    await bench("_id:{$in} x25  (branch, fan-out on)", { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, limit: 25, identifier: "hybridQuery" });
})().catch((e) => { console.error(e); process.exit(1); });
