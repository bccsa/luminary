const https = require("https");
const zlib = require("zlib");
const agent = new https.Agent({ keepAlive: true });
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
                resolve({ ms: performance.now() - t, status: rs.statusCode, docs: (j.docs || []).length, warn: j.warning ? "SCAN" : "none" });
            });
        });
        r.on("error", reject); r.setTimeout(120000, () => r.destroy(new Error("timeout")));
        r.write(JSON.stringify(body)); r.end();
    });
}

// The exact tag-sync shape from the app (30-day publishDate window, full updatedTimeUtc range)
const base = {
    cms: false,
    identifier: "sync",
    limit: 100,
    selector: {
        type: "content",
        parentType: "tag",
        updatedTimeUtc: { $lte: 9007199254740991, $gte: 0 },
        publishDate: { $gte: Date.now() - 30 * 864e5 },
        $or: [{ language: { $in: ["lang-eng"] } }],
        memberOf: { $elemMatch: { $in: ["group-public-users", "group-public-content", "group-languages"] } },
    },
    sort: [{ updatedTimeUtc: "desc" }],
};

(async () => {
    for (const idx of ["sync-content-index", "sync-tag-content-index"]) {
        const runs = [];
        for (let i = 0; i < 5; i++) runs.push(await q({ ...base, use_index: idx }));
        const ms = runs.map((r) => r.ms).sort((a, b) => a - b);
        console.log(`${idx.padEnd(24)}  status ${runs[0].status}  docs ${runs[0].docs}  median ${ms[2].toFixed(0)}ms  range ${ms[0].toFixed(0)}-${ms[4].toFixed(0)}ms  warn ${runs.filter((r) => r.warn === "SCAN").length}/5`);
    }
    agent.destroy();
})().catch((e) => { console.error(e); agent.destroy(); process.exit(1); });
