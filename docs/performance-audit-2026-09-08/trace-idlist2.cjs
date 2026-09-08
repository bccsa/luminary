const http = require("http");
const auth = "Basic " + Buffer.from("admin:admin123").toString("base64");
const base = "http://127.0.0.1:5984/luminary-perf-pr1818-20260908";
function couch(path, body, method) {
    return new Promise((resolve, reject) => {
        const r = http.request(new URL(base + path), { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", authorization: auth } }, (res) => {
            const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch { resolve(Buffer.concat(c).toString()); } });
        });
        r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
    });
}
(async () => {
    const sample = await couch("/_find", { selector: { type: "content", parentType: "post" }, limit: 25, fields: ["_id"] });
    const ids = sample.docs.map((d) => d._id);

    for (let i = 0; i < 3; i++) {
        const t = performance.now();
        const r = await couch("/_all_docs?include_docs=true", { keys: ids });
        const ms = performance.now() - t;
        const got = (r.rows || []).filter((row) => row.doc).length;
        if (i === 2) console.log(`_all_docs?keys (${ids.length} keys): ${got} docs in ${ms.toFixed(1)}ms  (rows examined = ${ids.length}, not the partition)`);
    }
    // vs the current Mango scan for reference
    for (let i = 0; i < 3; i++) {
        const t = performance.now();
        const r = await couch("/_find", { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] }, execution_stats: true, limit: 25 });
        const ms = performance.now() - t;
        if (i === 2) console.log(`_find {type,_id:$in}       : ${(r.docs || []).length} docs in ${ms.toFixed(1)}ms  examined ${r.execution_stats.total_docs_examined}`);
    }
})().catch((e) => { console.error(e); process.exit(1); });
