import * as fs from "fs";
import * as path from "path";
import { PerfConfig } from "./config";
import { PerfContext } from "./context";
import { humanBytes, r, table } from "./stats";
import { LatencyResult } from "../suites/latency";
import { ExplainRow } from "../suites/explain";
import { IndexSuiteResult } from "../suites/indexes";
import { FtsStageRow } from "../suites/fts";
import { ConcurrencyRow } from "../suites/concurrency";
import { SocketRow } from "../suites/socket";

export type AuditReport = {
    startedAt: string;
    config: PerfConfig;
    context: PerfContext;
    latency?: LatencyResult[];
    explain?: ExplainRow[];
    indexes?: IndexSuiteResult;
    fts?: FtsStageRow[];
    concurrency?: ConcurrencyRow[];
    socket?: SocketRow[];
};

export type Finding = {
    severity: "high" | "medium" | "low";
    area: string;
    title: string;
    detail: string;
};

export function writeReport(report: AuditReport): { jsonPath: string; mdPath: string } {
    fs.mkdirSync(report.config.outDir, { recursive: true });
    const stamp = report.startedAt.replace(/[:.]/g, "-");

    const jsonPath = path.join(report.config.outDir, `perf-audit-${stamp}.json`);
    const mdPath = path.join(report.config.outDir, `perf-audit-${stamp}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    return { jsonPath, mdPath };
}

/* ────────────────────────────── findings ────────────────────────────── */

/**
 * Turn the measurements into ranked, actionable statements. Every finding carries the
 * numbers that produced it so it can be argued with rather than taken on trust.
 */
export function deriveFindings(report: AuditReport): Finding[] {
    const findings: Finding[] = [];
    const ok = (report.latency ?? []).filter(
        (row) => !row.error && !row.permissionBlocked && row.server,
    );

    // Writes on a read path are the most expensive kind of surprise: each one also lands in
    // the change feed and fans out over Socket.io.
    const writingReads = ok.filter(
        (row) => (row.db?.write ?? 0) > 0.01 && row.entry.path !== "/changerequest",
    );
    if (writingReads.length) {
        const worst = writingReads.sort((a, b) => (b.db!.write ?? 0) - (a.db!.write ?? 0))[0];
        findings.push({
            severity: "high",
            area: "auth",
            title: `${writingReads.length} read endpoint(s) perform a database WRITE per request`,
            detail:
                `e.g. \`${worst.entry.id}\` averages ${r(
                    worst.db!.write,
                    2,
                )} write(s) per request. ` +
                `Read requests should not write. Each write also emits on the CouchDB change feed, ` +
                `which fans out to every connected Socket.io client.`,
        });
    }

    // Auth cost, isolated by the guard-only endpoint where possible.
    const authHeavy = ok.filter(
        (row) => (row.spans.auth ?? 0) > 5 && row.spans.auth > 0.25 * row.server!.mean,
    );
    if (authHeavy.length) {
        const worst = authHeavy.sort((a, b) => b.spans.auth - a.spans.auth)[0];
        findings.push({
            severity: "high",
            area: "auth",
            title: "Identity resolution dominates request time",
            detail:
                `\`${worst.entry.id}\`: auth ${r(worst.spans.auth)} ms of ${r(
                    worst.server!.mean,
                )} ms mean ` +
                `(${pct(
                    worst.spans.auth,
                    worst.server!.mean,
                )}). The auth guard resolves identity on every ` +
                `request; results are not cached per token.`,
        });
    }

    // Extra CouchDB round trips on a single-query endpoint.
    const chatty = ok.filter((row) => row.entry.path === "/query" && (row.db?.find ?? 0) > 1.5);
    if (chatty.length) {
        findings.push({
            severity: "medium",
            area: "db",
            title: `${chatty.length} /query request(s) make more than one CouchDB find`,
            detail:
                `Highest: \`${chatty.sort((a, b) => b.db!.find - a.db!.find)[0].entry.id}\` at ` +
                `${r(
                    chatty[0].db!.find,
                    2,
                )} finds. A single Mango query should be one round trip; ` +
                `the extras come from identity or cache lookups on the same request.`,
        });
    }

    // CouchDB's own warning is authoritative: it names the index it refused and why.
    for (const row of ok) {
        const warning = String(row.meta.warning ?? "");
        if (warning.includes("not used because")) {
            findings.push({
                severity: "high",
                area: "index",
                title: `CouchDB rejected the pinned index: \`${row.entry.id}\``,
                detail:
                    `${warning.split("\n")[0]} Executed as a scan: ${
                        row.meta.examined
                    } examined for ` +
                    `${row.meta.docs} returned. Shape mirrors ${row.entry.source}.`,
            });
        }
    }

    // Scan-like queries.
    for (const row of ok) {
        const examined = Number(row.meta.examined ?? 0);
        const docs = Number(row.meta.docs ?? 0);
        if (examined > 1000 || (examined > 100 && examined > 10 * Math.max(docs, 1))) {
            findings.push({
                severity: examined > 5000 ? "high" : "medium",
                area: "query",
                title: `Scan-like query: \`${row.entry.id}\``,
                detail:
                    `examined ${examined} docs to return ${docs} (index \`${
                        row.meta.use_index ?? "none"
                    }\`, shape from ${row.entry.source}, ` +
                    `${r(
                        row.server!.mean,
                    )} ms mean). The injected permission/status/language clauses are ` +
                    `applied after the index seek, so the index covers the sort but not the filter.`,
            });
        }
    }

    // Query plans.
    for (const row of report.explain ?? []) {
        if (row.fullScan) {
            findings.push({
                severity: "high",
                area: "index",
                title: `No usable index for \`${row.id}\``,
                detail: `CouchDB falls back to a full \`_all_docs\` scan for this shape (requested \`${
                    row.requested ?? "none"
                }\`).`,
            });
        } else if (!row.honoured) {
            findings.push({
                severity: "medium",
                area: "index",
                title: `Requested index ignored for \`${row.id}\``,
                detail: `Client pins \`${row.requested}\`; CouchDB chose \`${row.chosen}\`. The pin is not doing what the client expects.`,
            });
        }
    }

    // Index inventory.
    const unused = (report.indexes?.rows ?? []).filter((row) => row.deployed && !row.referenced);
    if (unused.length) {
        findings.push({
            severity: "medium",
            area: "index",
            title: `${unused.length} deployed index(es) with no code reference`,
            detail:
                `${unused.map((u) => `\`${u.name}\` (${humanBytes(u.diskSize)})`).join(", ")}. ` +
                `Every index is updated on every matching document write, so one that is genuinely ` +
                `unused is a permanent write-throughput cost. Confirm before removing: CouchDB can ` +
                `still choose an index automatically for a query that does not pin it by name.`,
        });
    }

    const lagging = (report.indexes?.rows ?? []).filter((row) => row.seqLag > 1000 || row.building);
    if (lagging.length) {
        findings.push({
            severity: "medium",
            area: "index",
            title: `${lagging.length} view index(es) lag the database`,
            detail:
                lagging
                    .map(
                        (l) =>
                            `\`${l.name}\` (${l.building ? "building, " : ""}${
                                l.seqLag
                            } seq behind)`,
                    )
                    .join(", ") +
                `. A lagging view means the first read after a write pays the catch-up build.`,
        });
    }

    const missing = (report.indexes?.rows ?? []).filter((row) => !row.deployed);
    if (missing.length) {
        findings.push({
            severity: "high",
            area: "index",
            title: `${missing.length} declared index(es) are not deployed`,
            detail: `${missing
                .map((m) => `\`${m.name}\``)
                .join(", ")}. Queries pinning these fall back to a scan.`,
        });
    }

    // FTS.
    for (const row of report.fts ?? []) {
        if (row.budgetBound) {
            findings.push({
                severity: "medium",
                area: "fts",
                title: `Search hits the candidate-row budget: \`${row.id}\``,
                detail:
                    `${row.candidateRows} candidate rows scanned, ${row.survivors} survived filtering, ` +
                    `top-K ${row.topK}, ${r(
                        row.totalMs,
                    )} ms. Ranking worked from a truncated candidate set.`,
            });
        }
        if (row.totalMs > 500) {
            findings.push({
                severity: row.totalMs > 1500 ? "high" : "medium",
                area: "fts",
                title: `Slow search: \`${row.id}\` at ${r(row.totalMs)} ms`,
                detail:
                    `${row.trigrams} trigrams (${row.keptTrigrams} kept) → ${row.candidateRows} candidate rows ` +
                    `→ ${row.survivors} survivors → ${row.viewCalls} view call(s), ${r(
                        row.dbMs,
                    )} ms in CouchDB.`,
            });
        }
    }

    // Load.
    const byTarget = groupBy(report.concurrency ?? [], (row) => row.id);
    for (const [id, rows] of byTarget) {
        const sorted = [...rows].sort((a, b) => a.concurrency - b.concurrency);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        if (!first || !last || first === last) continue;

        if (last.queueMs > 25 && last.queueMs > 3 * Math.max(first.queueMs, 1)) {
            const dbBound = last.dbMs > 0.5 * last.serverP95;
            findings.push({
                severity: "high",
                area: "load",
                title: `Requests queue under load: \`${id}\``,
                detail:
                    `At concurrency ${last.concurrency}: p95 ${r(last.p95)} ms, ${r(
                        last.throughput,
                    )} req/s. ` +
                    `Mean wait before the handler runs is ${r(last.queueMs)} ms (vs ${r(
                        first.queueMs,
                    )} ms at ` +
                    `concurrency ${first.concurrency}); handler p95 ${r(
                        last.serverP95,
                    )} ms, of which ` +
                    `${r(last.dbMs)} ms is CouchDB. ` +
                    (dbBound
                        ? `CouchDB is the bottleneck and requests queue behind it — making this query cheaper ` +
                          `is what raises the ceiling.`
                        : `Most of the handler time is not CouchDB wait, so the Node event loop is the limit.`),
            });
        }
        if (last.errors > 0) {
            findings.push({
                severity: "high",
                area: "load",
                title: `Errors under load: \`${id}\``,
                detail: `${last.errors}/${last.requests} requests failed at concurrency ${last.concurrency}.`,
            });
        }
    }

    // Payload size.
    const heavy = ok
        .filter((row) => row.wireBytes > 256 * 1024)
        .sort((a, b) => b.wireBytes - a.wireBytes);
    if (heavy.length) {
        findings.push({
            severity: "medium",
            area: "payload",
            title: `${heavy.length} response(s) exceed 256 KB on the wire`,
            detail:
                `Largest: \`${heavy[0].entry.id}\` at ${humanBytes(
                    heavy[0].wireBytes,
                )} compressed ` +
                `(${humanBytes(
                    heavy[0].bytes,
                )} decoded). On an offline-first client the number of sync ` +
                `round trips and their size drive cold-start time as much as per-request latency.`,
        });
    }

    // Socket handshake.
    for (const row of report.socket ?? []) {
        if (row.error) {
            findings.push({
                severity: "low",
                area: "socket",
                title: `Socket handshake failed (${row.mode})`,
                detail: row.error,
            });
        } else if (row.accessMapBytes > 128 * 1024) {
            findings.push({
                severity: "medium",
                area: "socket",
                title: `Large access map delivered on connect (${row.mode})`,
                detail:
                    `${humanBytes(row.accessMapBytes)} across ${
                        row.accessMapGroups
                    } groups, sent on every ` + `connect and reconnect.`,
            });
        }
    }

    // Requests the audit identity cannot make are a coverage gap, not a performance result.
    const blocked = (report.latency ?? []).filter((row) => row.permissionBlocked);
    if (blocked.length) {
        findings.push({
            severity: "low",
            area: "coverage",
            title: `${blocked.length} request shape(s) not measured — the audit identity lacks access`,
            detail:
                `${blocked.map((b) => `\`${b.entry.id}\``).join(", ")}. ` +
                `${
                    blocked.some((b) => b.entry.requiresCmsView)
                        ? "Most of these need CmsView. "
                        : ""
                }` +
                `Re-run with --token/--provider as a CMS user to cover them.`,
        });
    }

    // Failures are worth surfacing even though they are not performance results.
    const failed = (report.latency ?? []).filter((row) => row.error);
    if (failed.length) {
        findings.push({
            severity: "low",
            area: "coverage",
            title: `${failed.length} catalogue entr(ies) did not return the expected status`,
            detail: failed.map((f) => `\`${f.entry.id}\` (${f.status}: ${f.error})`).join("; "),
        });
    }

    const rank = { high: 0, medium: 1, low: 2 };
    return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ────────────────────────────── markdown ────────────────────────────── */

function renderMarkdown(report: AuditReport): string {
    const { config, context } = report;
    const findings = deriveFindings(report);
    const out: string[] = [];

    out.push(`# API performance audit`);
    out.push(`Run ${report.startedAt} against ${config.baseUrl} (database \`${config.couchDb}\`).`);
    out.push("");
    out.push(
        `Identity: **${context.anonymous ? "anonymous" : "authenticated"}**. ` +
            `Samples per request: ${config.samples} (after ${config.warmup} warm-up). ` +
            `Suites: ${config.suites.join(", ")}.`,
    );
    out.push("");

    if (context.anonymous) {
        out.push(
            `> **Coverage note.** This run used the anonymous identity, whose groups come from a cached ` +
                `lookup — so the auth phase here is close to free. The authenticated path does considerably ` +
                `more per request (provider lookup, JWKS verification, up to three user lookups and a ` +
                `\`lastLogin\` write). Re-run with \`--token\`/\`--provider\` to measure it.`,
        );
        out.push("");
    }

    out.push(`## Corpus`);
    out.push(
        table(
            ["Doc type", "Count"],
            Object.entries(context.counts).map(([type, count]) => [
                type,
                count < 0 ? "n/a" : count,
            ]),
            [false, true],
        ),
    );
    out.push("");
    out.push(`Database file size: **${humanBytes(context.dbSizeBytes)}**.`);
    out.push("");

    out.push(`## Findings`);
    if (!findings.length) {
        out.push(`No thresholds were crossed in this run.`);
    } else {
        for (const finding of findings) {
            out.push(`### ${severityLabel(finding.severity)} — ${finding.title}`);
            out.push(`*${finding.area}* — ${finding.detail}`);
            out.push("");
        }
    }
    out.push("");

    if (report.latency?.length) {
        out.push(`## Request latency`);
        out.push(
            `\`client\` is end-to-end including transfer. \`server\` is the API's own handler time. ` +
                `\`auth\`/\`validate\`/\`couch\` are traced phases; \`db\` counts CouchDB round trips per request. ` +
                `\`examined\` is CouchDB's \`total_docs_examined\`. \`wire\` is the Brotli-compressed ` +
                `body (what the client downloads); \`decoded\` is what it parses.`,
        );
        out.push("");

        for (const [group, rows] of groupBy(report.latency, (row) => row.entry.group)) {
            out.push(`### ${group}`);
            out.push(
                table(
                    [
                        "Request",
                        "p50",
                        "p95",
                        "server p50",
                        "auth",
                        "couch",
                        "db calls",
                        "db ms",
                        "docs",
                        "examined",
                        "wire",
                        "decoded",
                    ],
                    rows.map((row) => [
                        `\`${row.entry.id}\`${
                            row.error ? " ⚠️" : row.permissionBlocked ? " 🔒" : ""
                        }`,
                        row.client.p50,
                        row.client.p95,
                        row.server ? row.server.p50 : "—",
                        r(row.spans.auth ?? 0),
                        r(row.spans.couch ?? row.spans.search ?? row.spans.query ?? 0),
                        row.db ? r(row.db.find + row.db.get + row.db.view + row.db.write, 2) : "—",
                        row.db ? r(row.db.ms) : "—",
                        (row.meta.docs as number) ?? "—",
                        (row.meta.examined as number) ?? "—",
                        humanBytes(row.wireBytes),
                        humanBytes(row.bytes),
                    ]),
                    [false, true, true, true, true, true, true, true, true, true, true, true],
                ),
            );
            out.push("");
            for (const row of rows) {
                out.push(
                    `- \`${row.entry.id}\` — ${row.entry.label} _(${row.entry.source})_` +
                        (row.error ? ` — **${row.error}**` : "") +
                        (row.permissionBlocked ? ` — 🔒 not permitted for this identity` : ""),
                );
            }
            out.push("");
        }

        out.push(`### Where the time goes`);
        out.push(phaseSummary(report.latency));
        out.push("");
    }

    if (report.explain?.length) {
        out.push(`## Query plans`);
        out.push(
            `CouchDB's index choice for each client-shaped query, before the API injects its ` +
                `permission, status and language clauses.`,
        );
        out.push("");
        out.push(
            table(
                ["Request", "Requested index", "Chosen", "Honoured", "Full scan"],
                report.explain.map((row) => [
                    `\`${row.id}\``,
                    row.requested ? `\`${row.requested}\`` : "—",
                    `\`${row.chosen}\``,
                    row.honoured ? "yes" : "**no**",
                    row.fullScan ? "**yes**" : "no",
                ]),
            ),
        );
        out.push("");
    }

    if (report.indexes) {
        out.push(`## Index inventory`);
        out.push(`Database update sequence: ${report.indexes.dbUpdateSeq}.`);
        out.push("");
        out.push(
            table(
                ["Index", "Deployed", "Referenced", "Disk", "Seq lag", "Building"],
                report.indexes.rows.map((row) => [
                    `\`${row.name}\``,
                    row.deployed ? "yes" : "**no**",
                    row.referenced ? "yes" : "**no**",
                    humanBytes(row.diskSize),
                    row.seqLag,
                    row.building ? "yes" : "no",
                ]),
                [false, false, false, true, true, false],
            ),
        );
        if (report.indexes.orphaned.length) {
            out.push("");
            out.push(
                `Design docs in CouchDB with no JSON file behind them: ` +
                    report.indexes.orphaned.map((o) => `\`${o}\``).join(", "),
            );
        }
        out.push("");
    }

    if (report.fts?.length) {
        out.push(`## Full-text search pipeline`);
        out.push(
            `Each search runs trigram lookup → candidate rows → permission/visibility filter → ` +
                `top-K document fetch → BM25. The row counts show which stage the cost sits in.`,
        );
        out.push("");
        out.push(
            table(
                [
                    "Search",
                    "total ms",
                    "db ms",
                    "views",
                    "trigrams",
                    "kept",
                    "cand. rows",
                    "survivors",
                    "top-K",
                    "results",
                ],
                report.fts.map((row) => [
                    `\`${row.id}\``,
                    row.totalMs,
                    row.dbMs,
                    row.viewCalls,
                    row.trigrams,
                    row.keptTrigrams,
                    row.candidateRows,
                    row.survivors,
                    row.topK,
                    row.results,
                ]),
                [false, true, true, true, true, true, true, true, true, true],
            ),
        );
        out.push("");
    }

    if (report.concurrency?.length) {
        out.push(`## Latency under load`);
        out.push(
            `\`queue ms\` is client time minus server handler time — how long a request waited before ` +
                `the API handled it. It growing faster than \`server p95\` points at the Node event loop ` +
                `rather than CouchDB.`,
        );
        out.push("");
        out.push(
            table(
                [
                    "Request",
                    "concurrency",
                    "req/s",
                    "p50",
                    "p95",
                    "max",
                    "queue ms",
                    "server p95",
                    "db ms",
                    "errors",
                ],
                report.concurrency.map((row) => [
                    `\`${row.id}\``,
                    row.concurrency,
                    row.throughput,
                    row.p50,
                    row.p95,
                    row.max,
                    r(row.queueMs),
                    row.serverP95,
                    r(row.dbMs),
                    row.errors,
                ]),
                [false, true, true, true, true, true, true, true, true, true],
            ),
        );
        out.push("");
    }

    if (report.socket?.length) {
        out.push(`## Socket.io connect`);
        out.push(
            table(
                [
                    "Mode",
                    "samples",
                    "connect p50",
                    "connect p95",
                    "handshake p50",
                    "handshake p95",
                    "accessMap",
                    "groups",
                ],
                report.socket.map((row) => [
                    row.mode,
                    row.samples,
                    row.connect.p50,
                    row.connect.p95,
                    row.handshake.p50,
                    row.handshake.p95,
                    humanBytes(row.accessMapBytes),
                    row.accessMapGroups,
                ]),
                [false, true, true, true, true, true, true, true],
            ),
        );
        for (const row of report.socket.filter((r) => r.error)) {
            out.push("");
            out.push(`\`${row.mode}\`: ${row.error}`);
        }
        out.push("");
    }

    return out.join("\n");
}

/** Aggregate the traced phases across every successful request, so the split is visible at a glance. */
function phaseSummary(results: LatencyResult[]): string {
    const ok = results.filter((row) => !row.error && row.server);
    if (!ok.length) return "_No traced requests. Is the API running with `PERF_TRACE=true`?_";

    const totals = new Map<string, number>();
    let serverTotal = 0;
    let dbTotal = 0;

    for (const row of ok) {
        serverTotal += row.server!.mean;
        dbTotal += row.db?.ms ?? 0;
        for (const [name, ms] of Object.entries(row.spans)) {
            totals.set(name, (totals.get(name) ?? 0) + ms);
        }
    }

    const rows = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, ms]) => [name, r(ms / ok.length), pct(ms, serverTotal)]);

    rows.push(["_CouchDB wait (all calls)_", r(dbTotal / ok.length), pct(dbTotal, serverTotal)]);

    return table(["Phase", "mean ms / request", "share of handler time"], rows, [
        false,
        true,
        true,
    ]);
}

function pct(part: number, whole: number): string {
    if (!whole) return "—";
    return `${r((part / whole) * 100, 1)}%`;
}

function severityLabel(severity: Finding["severity"]): string {
    return severity === "high" ? "🔴 High" : severity === "medium" ? "🟠 Medium" : "🟡 Low";
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const k = key(item);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(item);
    }
    return map;
}
