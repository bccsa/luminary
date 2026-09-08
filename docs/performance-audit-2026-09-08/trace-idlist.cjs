const http = require("http");
const C = "http://admin:admin123@127.0.0.1:5984/luminary-perf-pr1818-20260908";

function couch(path, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(C + path);
        const r = http.request(u, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from("admin:admin123").toString("base64") } }, (res) => {
            const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch { resolve(Buffer.concat(c).toString()); } });
        });
        r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
    });
}

(async () => {
    // 25 content ids + a real memberOf set from those docs
    const sample = await couch("/_find", { selector: { type: "content", parentType: "post" }, limit: 25, fields: ["_id", "memberOf"] });
    const ids = sample.docs.map((d) => d._id);
    const groups = [...new Set(sample.docs.flatMap((d) => d.memberOf || []))];
    console.log(`${ids.length} ids, memberOf groups seen: ${JSON.stringify(groups)}`);

    const variants = {
        "A. {_id:$in} only": { selector: { _id: { $in: ids } } },
        "B. {type, _id:$in}": { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }] } },
        "C. {type, _id:$in, memberOf:$elemMatch} (permission-injected)": { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }, { memberOf: { $elemMatch: { $in: groups } } }] } },
        "D. C + use_index _all_docs (special)": { selector: { $and: [{ type: "content" }, { _id: { $in: ids } }, { memberOf: { $elemMatch: { $in: groups } } }] }, use_index: "_all_docs" },
        "E. C + sort updatedTimeUtc + use_index sync-post-content-index": { selector: { $and: [{ type: "content" }, { parentType: "post" }, { _id: { $in: ids } }, { memberOf: { $elemMatch: { $in: groups } } }] }, sort: [{ updatedTimeUtc: "desc" }], use_index: "sync-post-content-index" },
    };

    for (const [name, q] of Object.entries(variants)) {
        const ex = await couch("/_explain", q);
        const idx = ex.index ? `${ex.index.name} (${ex.index.type})` : "?";
        const stats = await couch("/_find", { ...q, execution_stats: true, limit: 25 });
        console.log(`\n${name}`);
        console.log(`  chosen index : ${idx}`);
        console.log(`  fields covered: ${JSON.stringify(ex.index?.def?.fields ?? ex.index?.def)}`);
        console.log(`  docs returned : ${(stats.docs || []).length}   examined: ${stats.execution_stats?.total_docs_examined}   keys: ${stats.execution_stats?.total_keys_examined}   time: ${stats.execution_stats?.execution_time_ms?.toFixed?.(1)}ms`);
        if (stats.warning) console.log(`  WARNING: ${stats.warning}`);
    }
})().catch((e) => { console.error(e); process.exit(1); });
