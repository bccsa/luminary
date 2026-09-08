const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const fs = require("fs");

const BASELINE = "http://localhost:3100";
const CANDIDATE = "http://localhost:3200";
const SAMPLES = 20;
const WARMUP = 3;
const OUT = "/private/tmp/claude-501/-Users-dirk-Work-Projects-luminary/6e9a64fa-6590-4bc0-bed2-a94d65141efb/scratchpad/pr1818-comparison.json";

function req(base, path, body) {
    return new Promise((resolve, reject) => {
        const started = performance.now();
        const r = http.request(
            new URL(path, base),
            { method: "POST", headers: { "content-type": "application/json", "accept-encoding": "br, gzip, deflate" } },
            (res) => {
                const firstByteMs = performance.now() - started;
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => {
                    const totalMs = performance.now() - started;
                    const wire = Buffer.concat(chunks);
                    const enc = res.headers["content-encoding"];
                    const dec =
                        enc === "br" ? zlib.brotliDecompressSync(wire)
                        : enc === "gzip" ? zlib.gunzipSync(wire)
                        : enc === "deflate" ? zlib.inflateSync(wire)
                        : wire;
                    let json; try { json = JSON.parse(dec.toString()); } catch { json = {}; }
                    let trace; try { trace = JSON.parse(res.headers["x-perf-trace"]); } catch { trace = undefined; }
                    const docs = json.docs || [];
                    resolve({
                        status: res.statusCode,
                        totalMs,
                        firstByteMs,
                        wireBytes: wire.length,
                        decodedBytes: dec.length,
                        docs: docs.length,
                        idHash: crypto.createHash("sha256").update(JSON.stringify(docs.map((d) => d._id).sort())).digest("hex").slice(0, 12),
                        warning: json.warning || json.warnings,
                        trace,
                    });
                });
            },
        );
        r.setTimeout(30000, () => r.destroy(new Error("timeout")));
        r.on("error", reject);
        r.write(JSON.stringify(body));
        r.end();
    });
}

function stats(xs) {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, min: +s[0].toFixed(1), median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) };
}

async function main() {
    // Mirror catalogue context discovery: sample {type:content, parentType:post} limit 200, no sort.
    const sample = await req(BASELINE, "/query", { selector: { type: "content", parentType: "post" }, limit: 200, identifier: "sync" });
    const content = [];
    {
        const raw = await new Promise((resolve, reject) => {
            const r = http.request(new URL("/query", BASELINE), { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
                const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => resolve(JSON.parse(Buffer.concat(c).toString())));
            });
            r.on("error", reject); r.write(JSON.stringify({ selector: { type: "content", parentType: "post" }, limit: 200, identifier: "sync" })); r.end();
        });
        raw.docs.forEach((d) => content.push(d));
    }
    const parentIds = [...new Set(content.map((d) => d.parentId).filter(Boolean))];
    const idList = content.slice(0, 25).map((d) => d._id);

    console.log(`discovered ${content.length} content docs, ${parentIds.length} unique parentIds`);

    const shapes = [
        {
            id: "hybrid-by-id-list",
            note: "_id:$in of 25 content ids, limit 25 — NOT a fan-out shape, PR should not change it",
            body: { selector: { $and: [{ type: "content" }, { _id: { $in: idList } }] }, limit: 25, identifier: "hybridQuery" },
        },
        {
            id: "hybrid-parentId-fanout-overflow",
            note: "parentId:$in of 40 parents, limit 50, no sort — the PR's target shape",
            body: { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds.slice(0, 40) } }] }, use_index: "content-parentId-publishDate-index", limit: 50, identifier: "hybridQuery" },
        },
        {
            id: "hybrid-parentId-fanout-overflow-sorted",
            note: "same but WITH publishDate sort — the shape the client actually pins the index for",
            body: { selector: { $and: [{ type: "content" }, { parentId: { $in: parentIds.slice(0, 40) } }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" },
        },
        {
            id: "hybrid-by-parentId-single",
            note: "control: single parentId equality, unchanged by PR",
            body: { selector: { $and: [{ type: "content" }, { parentId: parentIds[0] }] }, use_index: "content-parentId-publishDate-index", sort: [{ publishDate: "desc" }], limit: 50, identifier: "hybridQuery" },
        },
    ];

    const out = { startedAt: new Date().toISOString(), baseline: BASELINE, candidate: CANDIDATE, samples: SAMPLES, warmup: WARMUP, discovered: { content: content.length, parentIds: parentIds.length }, shapes: [], rows: [] };

    for (const shape of shapes) {
        for (let i = 0; i < WARMUP; i++) { await req(BASELINE, "/query", shape.body); await req(CANDIDATE, "/query", shape.body); }
        const rows = [];
        for (let i = 0; i < SAMPLES; i++) {
            const order = i % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"];
            for (const which of order) {
                const base = which === "baseline" ? BASELINE : CANDIDATE;
                const res = await req(base, "/query", shape.body);
                rows.push({ shape: shape.id, which, sample: i, ...res });
                out.rows.push({ shape: shape.id, which, sample: i, ...res });
            }
        }
        const summarize = (which) => {
            const rs = rows.filter((r) => r.which === which);
            const traced = rs.filter((r) => r.trace);
            return {
                status: [...new Set(rs.map((r) => r.status))],
                docs: [...new Set(rs.map((r) => r.docs))],
                idHash: [...new Set(rs.map((r) => r.idHash))],
                warningSamples: `${rs.filter((r) => r.warning).length}/${rs.length}`,
                warningText: [...new Set(rs.map((r) => r.warning).filter(Boolean))],
                clientMs: stats(rs.map((r) => r.totalMs)),
                serverMs: traced.length ? stats(traced.map((r) => r.trace.t)) : null,
                couchMs: traced.length ? stats(traced.map((r) => r.trace.db?.ms ?? 0)) : null,
                dbFindCalls: traced.length ? [...new Set(traced.map((r) => r.trace.db?.find))] : null,
                docsExamined: traced.length ? [...new Set(traced.map((r) => r.trace.m?.examined))] : null,
                spans: traced.length ? traced[traced.length - 1].trace.s : null,
                wireBytes: Math.max(...rs.map((r) => r.wireBytes)),
            };
        };
        const entry = { id: shape.id, note: shape.note, baseline: summarize("baseline"), candidate: summarize("candidate") };
        out.shapes.push(entry);
        fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
        console.log(`\n== ${shape.id} ==`);
        console.log(`  baseline : median ${entry.baseline.clientMs.median}ms  server ${entry.baseline.serverMs?.median}ms  find×${entry.baseline.dbFindCalls}  examined ${entry.baseline.docsExamined}  warn ${entry.baseline.warningSamples}  docs ${entry.baseline.docs}`);
        console.log(`  candidate: median ${entry.candidate.clientMs.median}ms  server ${entry.candidate.serverMs?.median}ms  find×${entry.candidate.dbFindCalls}  examined ${entry.candidate.docsExamined}  warn ${entry.candidate.warningSamples}  docs ${entry.candidate.docs}`);
        console.log(`  same result set: ${JSON.stringify(entry.baseline.idHash) === JSON.stringify(entry.candidate.idHash)}`);
    }

    out.completedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
