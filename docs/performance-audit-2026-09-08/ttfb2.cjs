const http = require("http");
const zlib = require("zlib");
const BASE = "http://localhost:3100";
function measure(body, acceptEncoding) {
    return new Promise((resolve, reject) => {
        const t0 = performance.now();
        const req = http.request(new URL("/query", BASE), { method: "POST", headers: { "content-type": "application/json", "accept-encoding": acceptEncoding } }, (res) => {
            const ttfb = performance.now() - t0;
            const chunks = []; res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const total = performance.now() - t0;
                const buf = Buffer.concat(chunks);
                let tr; try { tr = JSON.parse(res.headers["x-perf-trace"]); } catch { tr = {}; }
                resolve({ status: res.statusCode, ttfb, transfer: total - ttfb, total, serverT: tr.t, spans: tr.s, enc: res.headers["content-encoding"] || "identity", wire: buf.length });
            });
        });
        req.on("error", reject); req.write(JSON.stringify(body)); req.end();
    });
}
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
    const raw = await new Promise((res) => { const r = http.request(new URL("/query", BASE), { method: "POST", headers: { "content-type": "application/json" } }, (rs) => { const c = []; rs.on("data", (x) => c.push(x)); rs.on("end", () => res(JSON.parse(Buffer.concat(c).toString()))); }); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 100, identifier: "sync" })); r.end(); });
    const shapes = {
        "post sync x100 (~1MB)": { selector: { type: "content", parentType: "post", updatedTimeUtc: { $lte: 9e15, $gte: 0 }, language: { $in: ["lang-eng", "lang-fra"] } }, use_index: "sync-content-index", sort: [{ updatedTimeUtc: "desc" }], limit: 100, identifier: "sync" },
        "max limit x500 (~2MB)": { selector: { $and: [{ type: "content" }, { publishDate: { $lte: Date.now() } }] }, use_index: "content-publishDate-index", sort: [{ publishDate: "desc" }], limit: 500, identifier: "hybridQuery" },
    };
    for (const [name, body] of Object.entries(shapes)) {
        for (const acc of ["br", "gzip", "identity"]) {
            for (let i = 0; i < 3; i++) await measure(body, acc);
            const rs = []; for (let i = 0; i < 15; i++) rs.push(await measure(body, acc));
            const l = rs[rs.length - 1];
            console.log(`${name}  accept=${acc.padEnd(8)} enc=${l.enc.padEnd(8)} ttfb=${p50(rs.map(r => r.ttfb)).toFixed(1)}ms xfer=${p50(rs.map(r => r.transfer)).toFixed(1)}ms  srvT=${l.serverT?.toFixed(1)}  wire=${(l.wire / 1024).toFixed(0)}K  spans=${JSON.stringify(l.spans)}`);
        }
        console.log();
    }
})().catch((e) => { console.error(e); process.exit(1); });
