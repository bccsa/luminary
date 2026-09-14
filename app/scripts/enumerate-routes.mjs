/* eslint-env node */
/**
 * Enumerate-only entry point: prints the public route set the web build would prerender,
 * without rendering anything. A driver that renders the site as several scoped passes needs the
 * route list up front to batch it, and this keeps that list coming from the build's own
 * enumeration (`src/ssg/routeEnumeration.ts`) instead of a copy of the eligibility, language and
 * slug rules.
 *
 * Usage: npm run enumerate:web [-- --out routes.json]
 * JSON goes to stdout (progress/errors to stderr), so it can be piped straight into a driver.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, loadEnv } from "vite";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write("Usage: node scripts/enumerate-routes.mjs [--out <file>]\n");
    process.exit(0);
}
const outIndex = args.indexOf("--out");
const outFile = outIndex === -1 ? undefined : args[outIndex + 1];
if (outIndex !== -1 && !outFile) {
    process.stderr.write("[ssg] --out needs a file path\n");
    process.exit(1);
}

const env = loadEnv("", process.cwd());
const apiUrl = process.env.SSG_API_URL || env.VITE_API_URL;
if (!apiUrl) {
    process.stderr.write("[ssg] VITE_API_URL (or SSG_API_URL) is required for route enumeration\n");
    process.exit(1);
}

// Vite (rather than a TypeScript runner) resolves the build's own modules here, so the script
// sees the same aliases and source the prerender does with no extra dependency.
const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.web.ts", import.meta.url)),
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
});

try {
    const { enumerateSite, queryTransport } = await server.ssrLoadModule(
        "/src/ssg/routeEnumeration.ts",
    );
    const { routes: routeRecords } = await server.ssrLoadModule("/src/router/routes.ts");

    const now = Date.now();
    const site = await enumerateSite({
        transportFor: (operation) => queryTransport(apiUrl, operation),
        routeRecords,
        now,
    });
    const { staticRoutes, localizedRoutes, slugRoutes, all } = site.routes;

    const payload = {
        generatedAt: new Date(now).toISOString(),
        counts: {
            all: all.length,
            static: staticRoutes.length,
            localized: localizedRoutes.length,
            slug: slugRoutes.length,
        },
        routes: all,
        groups: { static: staticRoutes, localized: localizedRoutes, slug: slugRoutes },
    };
    const json = JSON.stringify(payload, null, 2);

    if (outFile) {
        writeFileSync(outFile, `${json}\n`);
        process.stderr.write(`[ssg] wrote ${all.length} route(s) to ${outFile}\n`);
    } else {
        process.stdout.write(`${json}\n`);
    }
} finally {
    await server.close();
}
