import { buildCatalogue } from "./catalogue";
import { loadConfig } from "./lib/config";
import { CouchClient } from "./lib/couch";
import { discoverContext } from "./lib/context";
import { ApiClient } from "./lib/http";
import { AuditReport, deriveFindings, writeReport } from "./lib/report";
import { runConcurrencySuite } from "./suites/concurrency";
import { runExplainSuite } from "./suites/explain";
import { runFtsSuite } from "./suites/fts";
import { runIndexSuite } from "./suites/indexes";
import { runLatencySuite } from "./suites/latency";
import { runSocketSuite } from "./suites/socket";

async function main() {
    const config = loadConfig(process.argv.slice(2));
    const api = new ApiClient(config);
    const couch = new CouchClient(config);

    log(`Target        ${config.baseUrl}`);
    log(`CouchDB       ${config.couchUrl.replace(/\/\/[^@]*@/, "//***@")}/${config.couchDb}`);
    log(`Suites        ${config.suites.join(", ")}`);
    log(`Identity      ${config.token ? "authenticated (token supplied)" : "anonymous"}`);
    log("");

    await assertApiReachable(api);
    await assertTracingEnabled(api);

    log("Discovering corpus…");
    const context = await discoverContext(api, couch);
    const catalogue = buildCatalogue(context);
    log(`  ${catalogue.length} request shapes built from ${context.counts.content} content docs`);
    log("");

    const report: AuditReport = {
        startedAt: new Date().toISOString(),
        config,
        context,
        // config.suites is validated in loadConfig, so an unknown name never reaches here.
    };

    if (config.suites.includes("indexes")) {
        log("Suite: index inventory");
        report.indexes = await runIndexSuite(couch, catalogue);
    }

    if (config.suites.includes("explain")) {
        log("Suite: query plans");
        report.explain = await runExplainSuite(couch, catalogue);
    }

    if (config.suites.includes("latency")) {
        log(`Suite: latency (${config.samples} samples + ${config.warmup} warm-up per request)`);
        report.latency = await runLatencySuite(api, catalogue, config, (entry, index, total) => {
            process.stdout.write(`\r  [${index + 1}/${total}] ${entry.id.padEnd(36)}`);
        });
        process.stdout.write("\r" + " ".repeat(60) + "\r");
    }

    if (config.suites.includes("fts")) {
        log("Suite: full-text search pipeline");
        report.fts = await runFtsSuite(api, catalogue);
    }

    if (config.suites.includes("concurrency")) {
        log(
            `Suite: load (concurrency ${config.concurrency.join(", ")}; ${
                config.concurrencyRequests
            } requests each)`,
        );
        report.concurrency = await runConcurrencySuite(
            api,
            catalogue,
            config,
            (label, concurrency) => {
                process.stdout.write(
                    `\r  c=${String(concurrency).padEnd(4)} ${label.slice(0, 50).padEnd(52)}`,
                );
            },
        );
        process.stdout.write("\r" + " ".repeat(60) + "\r");
    }

    if (config.suites.includes("socket")) {
        log("Suite: socket.io connect");
        report.socket = await runSocketSuite(config);
    }

    const { jsonPath, mdPath } = writeReport(report);
    const findings = deriveFindings(report);

    log("");
    log(
        `Findings: ${count(findings, "high")} high, ${count(findings, "medium")} medium, ${count(
            findings,
            "low",
        )} low`,
    );
    for (const finding of findings.slice(0, 8)) {
        log(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
    }
    if (findings.length > 8) log(`  … ${findings.length - 8} more in the report`);
    log("");
    log(`Report  ${mdPath}`);
    log(`Data    ${jsonPath}`);
}

async function assertApiReachable(api: ApiClient) {
    const res = await api.get("/protected");
    if (res.status === 0) {
        throw new Error(
            `Cannot reach the API. Start it with \`PERF_TRACE=true npm run start:dev\` first.\n  ${res.error}`,
        );
    }
}

/**
 * Without the trace header the audit still produces end-to-end timings, but not the phase
 * breakdown that makes them actionable — so say so loudly rather than quietly degrading.
 */
async function assertTracingEnabled(api: ApiClient) {
    const res = await api.get("/protected");
    if (!res.trace) {
        log("⚠️  No X-Perf-Trace header — the API is not running with PERF_TRACE=true.");
        log(
            "   End-to-end timings will be collected, but the per-phase and DB-call breakdown will be empty.",
        );
        log("");
    }
}

function count(findings: { severity: string }[], severity: string): number {
    return findings.filter((f) => f.severity === severity).length;
}

function log(message: string) {
    console.log(message);
}

main().catch((err) => {
    console.error(`\n${err?.message ?? err}`);
    process.exit(1);
});
