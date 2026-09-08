const http = require("http");
const zlib = require("zlib");
const BASE = "http://localhost:3100";

// Raw http.request: the response callback fires on the response line + headers,
// which is the true time-to-first-byte. Everything after is body transfer.
function measure(body) {
    return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const req = http.request(
            new URL("/query", BASE),
            { method: "POST", headers: { "content-type": "application/json", "accept-encoding": "br, gzip" } },
            (res) => {
                const ttfb = performance.now() - t0;
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const total = performance.now() - t0;
                    const buf = Buffer.concat(chunks);
                    const enc = res.headers["content-encoding"];
                    const dec = enc === "br" ? zlib.brotliDecompressSync(buf) : enc === "gzip" ? zlib.gunzipSync(buf) : buf;
                    let j; try { j = JSON.parse(dec.toString()); } catch { j = {}; }
                    let tr; try { tr = JSON.parse(res.headers["x-perf-trace"]); } catch { tr = {}; }
                    resolve({
                        status: res.statusCode,
                        ttfb,
                        transfer: total - ttfb,
                        total,
                        serverT: tr.t,
                        couch: tr.db && tr.db.ms,
                        finds: tr.db && tr.db.find,
                        wireBytes: buf.length,
                        bodyBytes: dec.length,
                        docs: (j.docs || []).length,
                    });
                });
            },
        );
        req.on("error", reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}
const q = (a) => { const s = [...a].sort((x, y) => x - y); return { p50: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)] }; };
const f = (n) => (n == null ? "  —  " : n.toFixed(1).padStart(7));

(async () => {
    // discover ids/slug
    const raw = await new Promise((res) => { const r = http.request(new URL("/query", BASE), { method: "POST", headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 100, identifier: "sync" })); r.end(); });
    const ids = raw.docs.slice(0, 25).map((d) => d._id);
    const parentIds = [...new Set(raw.docs.map((d) => d.parentId).filter(Boolean))].slice(0, 40);

    const shapes = {
        "empty incremental (control)": { selector: { $and: [{ type: "content" }, { parentType: "post" }, { updatedTimeUtc: { $lte: 1, $gte: 0 } }] }, use_index: "sync-content-index", sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" },
        "slug lookup (control)": { selector: { $and: [{ type: "content" }, { slug: raw.docs[0].slug }] }, use_index: "content-slug-publishDate-index", sort: [{ publishDate: "desc" }], limit: 1, identifier: "hybridQuery" },
        "id-list _id:{$in} x25 (fixed)": { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, limit: 25, identifier: "hybridQuery" },
        "tag initial sync x100 (fixed)": { selector: { type: "content", parentType: "tag", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng", "lang-fra"] } }, use_index: "sync-tag-content-index", sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" },
        "multi-parent $in +sort x40": { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds } }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" },
        "post initial sync x100 (big body)": { selector: { type: "content", parentType: "post", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng", "lang-fra"] } }, use_index: "sync-content-index", sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" },
        "max limit x500 (biggest body)": { selector: { $and: [{ type: "content" }, { publishDate: { $lte: Date.now() } }] }, use_index: "content-publishDate-index", sort: [{ publishDate: "desc" }], limit: 500, identifier: "hybridQuery" },
    };

    console.log("shape".padEnd(36), "st  docs   ttfb  xfer  total  srvT  couch find  body");
    for (const [name, body] of Object.entries(shapes)) {
        for (let i = 0; i < 3; i++) await measure(body);
        const rs = []; for (let i = 0; i < 20; i++) rs.push(await measure(body));
        const last = rs[rs.length - 1];
        const T = q(rs.map((r) => r.ttfb)), X = q(rs.map((r) => r.transfer)), A = q(rs.map((r) => r.total));
        console.log(
            name.padEnd(36),
            String(last.status).padStart(3),
            String(last.docs).padStart(4),
            f(T.p50), f(X.p50), f(A.p50),
            f(last.serverT), f(last.couch),
            String(last.finds).padStart(3),
            (last.bodyBytes / 1024).toFixed(0) + "K",
            ` ttfb%=${((T.p50 / A.p50) * 100).toFixed(0)}`,
        );
    }
})().catch((e) => { console.error(e); process.exit(1); });
