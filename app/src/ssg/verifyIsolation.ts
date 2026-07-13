/**
 * Scoped-rebuild isolation check (Phase 2 §3.5): prove a `build:affected` changed
 * ONLY the intended files (the regenerated routes' HTML + SSG sidecars) and left
 * every other prerendered file byte-identical.
 *
 * Usage (the deploy watcher / local verification wraps a scoped rebuild like this):
 *   node src/ssg/verifyIsolation.ts snapshot > /tmp/before.json     # BEFORE build:affected
 *   SSG_ONLY_ROUTES=/foo npm run build:affected
 *   node src/ssg/verifyIsolation.ts check /tmp/before.json /foo     # AFTER  build:affected
 *
 * Exits non-zero (and lists the offending files) if anything outside the allowed
 * set changed.
 */
/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OUT_DIR = join(process.cwd(), "dist-web");

function hashDir(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (d: string) => {
        for (const name of readdirSync(d)) {
            const p = join(d, name);
            const s = statSync(p);
            if (s.isDirectory()) walk(p);
            else out[relative(OUT_DIR, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
        }
    };
    walk(dir);
    return out;
}

/** Files a scoped rebuild of `routes` is allowed to change. */
function allowedFiles(routes: string[]): Set<string> {
    const allowed = new Set<string>([
        "ssg-deps.json",
        "ssg-route-index.json",
        "ssg-redirect-index.json",
        "ssg-doc-facets.json",
    ]);
    for (const r of routes) {
        const file = r === "/" ? "index.html" : `${r.replace(/^\//, "")}.html`;
        allowed.add(file);
    }
    return allowed;
}

function diff(before: Record<string, string>, after: Record<string, string>): string[] {
    const changed: string[] = [];
    for (const f of new Set([...Object.keys(before), ...Object.keys(after)]))
        if (before[f] !== after[f]) changed.push(f);
    return changed.sort();
}

function main() {
    const [cmd, ...rest] = process.argv.slice(2);

    if (cmd === "snapshot") {
        process.stdout.write(JSON.stringify(hashDir(OUT_DIR)));
        return;
    }

    if (cmd === "check") {
        const [beforeFile, routesArg] = rest;
        if (!beforeFile || !routesArg) {
            console.error("usage: verifyIsolation.ts check <before.json> <route,route,...>");
            process.exit(2);
        }
        const before = JSON.parse(readFileSync(beforeFile, "utf-8")) as Record<string, string>;
        const after = hashDir(OUT_DIR);
        const routes = routesArg.split(",").map((r) => r.trim()).filter(Boolean);
        const allowed = allowedFiles(routes);
        const changed = diff(before, after);
        const unexpected = changed.filter((f) => !allowed.has(f));

        console.log(`[verify] ${changed.length} file(s) changed; allowed: ${[...allowed].join(", ")}`);
        if (unexpected.length) {
            console.error(`[verify] FAIL — unexpected file(s) changed:\n  ${unexpected.join("\n  ")}`);
            process.exit(1);
        }
        console.log("[verify] OK — only the intended files changed.");
        return;
    }

    console.error("usage: verifyIsolation.ts <snapshot | check>");
    process.exit(2);
}

main();
