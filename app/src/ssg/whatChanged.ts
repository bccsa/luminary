/**
 * Non-destructive "what would change?" simulation (Phase 2 §3.4). Given a changed
 * doc (by slug) or raw changed keys, intersect with the current
 * `dist-web/ssg-deps.json` and print the stale routes + fan-out. No build, no writes.
 *
 * Usage:
 *   node src/ssg/whatChanged.ts <slug>            # fetch the doc, derive its keys
 *   node src/ssg/whatChanged.ts --keys doc:ID,tag:T:lang
 *
 * This is the same logic the deploy watcher uses (computeAffected + dependencyKeys),
 * exposed as a read-only CLI for inspecting fan-out before wiring regeneration.
 */
/// <reference types="node" />
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ContentDto } from "luminary-shared";
import { computeAffected, simulateAffected, type DepsManifest } from "./computeAffected";

const MANIFEST = join(process.cwd(), "dist-web", "ssg-deps.json");

function apiUrl(): string {
    if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
    // Fall back to app/.env so the CLI works without exporting the var.
    const envPath = join(process.cwd(), ".env");
    if (existsSync(envPath)) {
        const m = readFileSync(envPath, "utf-8").match(/^VITE_API_URL\s*=\s*"?([^"\n]+)"?/m);
        if (m) return m[1].trim();
    }
    throw new Error("VITE_API_URL not set (env or app/.env)");
}

async function fetchDocBySlug(slug: string): Promise<ContentDto> {
    const res = await fetch(`${apiUrl()}/search`, {
        headers: { "X-Query": JSON.stringify({ apiVersion: "0.0.0", slug }) },
    });
    if (!res.ok) throw new Error(`/search failed: ${res.status}`);
    const data = (await res.json()) as { docs?: ContentDto[] };
    const doc = (data.docs ?? []).find((d) => d.type === ("content" as ContentDto["type"]));
    if (!doc) throw new Error(`no public content for slug "${slug}"`);
    return doc;
}

async function main() {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as DepsManifest;
    const args = process.argv.slice(2);

    if (args[0] === "--keys") {
        const keys = (args[1] ?? "").split(",").map((k: string) => k.trim()).filter(Boolean);
        const routes = computeAffected(keys, manifest);
        console.log(JSON.stringify({ changedKeys: keys, routes, fanout: routes.length / (Object.keys(manifest).length || 1) }, null, 2));
        return;
    }

    const slug = args[0];
    if (!slug) {
        console.error("usage: whatChanged.ts <slug> | --keys k1,k2");
        process.exit(2);
    }
    const doc = await fetchDocBySlug(slug);
    const result = simulateAffected(doc, manifest);
    console.log(JSON.stringify({ slug, ...result }, null, 2));
}

main();
