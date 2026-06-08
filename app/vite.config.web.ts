import { fileURLToPath, URL } from "node:url";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import type { ViteSSGOptions } from "vite-ssg";
import type { RouteRecordRaw } from "vue-router";
import vue from "@vitejs/plugin-vue";

const env = loadEnv("", process.cwd());

const OUT_DIR = "dist-web";
const WEB_ORIGIN = (env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");

// Captured during route enumeration so onFinished can emit sitemap.xml/robots.txt.
let prerenderedRoutes: string[] = [];

function writeSeoArtifacts() {
    const urls = prerenderedRoutes
        .map((r) => `  <url><loc>${WEB_ORIGIN}${r}</loc></url>`)
        .join("\n");
    const sitemap =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    writeFileSync(join(process.cwd(), OUT_DIR, "sitemap.xml"), sitemap);

    const robots =
        `User-agent: *\nAllow: /\n` +
        (WEB_ORIGIN ? `\nSitemap: ${WEB_ORIGIN}/sitemap.xml\n` : "\n");
    writeFileSync(join(process.cwd(), OUT_DIR, "robots.txt"), robots);

    console.log(`[ssg] wrote sitemap.xml (${prerenderedRoutes.length} urls) + robots.txt`);
}

/**
 * Web / SSG build config. Separate from the native/default `vite.config.ts` so
 * the native SPA build (the future Capacitor base) stays byte-for-byte unchanged.
 *
 * Differences from the native config:
 *  - Renders via vite-ssg (prerender → static HTML + clean hydration).
 *  - Entry is `src/main.web.ts` (not `src/main.ts`).
 *  - NO service worker (VitePWA omitted) — the web tier is online-only by design.
 *  - Enumerates public routes from the API at build time.
 *
 * Run with: `npm run build:web` (sets VITE_BUILD_TARGET=web).
 */

// Rewrites the client entry in index.html from the native entry to the web/SSG
// entry, without touching index.html on disk (keeps the native build untouched).
const rewriteWebEntry = (): Plugin => ({
    name: "ssg-web-entry",
    transformIndexHtml(html) {
        return html.replace("/src/main.ts", "/src/main.web.ts");
    },
});

// Paginate the unauthenticated /search endpoint to enumerate every public
// content slug. No Authorization header → anonymous default ("public") groups.
async function fetchPublicSlugs(apiUrl: string): Promise<string[]> {
    const PAGE = 100;
    const MAX = 5000; // safety cap; logged if hit
    const slugs = new Set<string>();
    let offset = 0;

    for (; offset < MAX; offset += PAGE) {
        const query = {
            apiVersion: "0.0.0",
            types: ["post", "tag"],
            contentOnly: true,
            limit: PAGE,
            offset,
        };
        const res = await fetch(`${apiUrl}/search`, {
            headers: { "X-Query": JSON.stringify(query) },
        });
        if (!res.ok) {
            throw new Error(`[ssg] route enumeration failed: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as { docs?: Array<{ slug?: string }> };
        const docs = data.docs ?? [];
        for (const d of docs) if (d.slug) slugs.add(d.slug);
        if (docs.length < PAGE) break; // last page
    }

    if (offset >= MAX) {
        console.warn(`[ssg] route enumeration hit the ${MAX} cap — some slugs may be missing`);
    }
    return [...slugs];
}

const config: UserConfig & { ssgOptions: ViteSSGOptions } = {
    plugins: [vue(), rewriteWebEntry()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    define: {
        // Make hydration mismatches visible even in the production build, so
        // "no warnings" during validation is a real proof (Phase 1 §7).
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "true",
    },
    build: {
        // Separate output dir from the native build (`dist/`) so a native build's
        // service worker can never contaminate the web output (which must ship NO
        // service worker). The deploy repo uploads `dist-web/`.
        outDir: OUT_DIR,
        emptyOutDir: true,
        target: "es2015",
        sourcemap: true,
        minify: env.VITE_BYPASS_MINIFY !== "true" && process.env.VITE_BYPASS_MINIFY !== "true",
        // NOTE: no manualChunks here — vite-ssg externalizes pinia/vue in the SSR
        // pass, and naming an external in manualChunks is a rollup error.
    },
    // Consumed by vite-ssg (see `ssgOptions` augmentation in vite-ssg types).
    ssgOptions: {
        entry: "src/main.web.ts",
        mock: true, // jsdom globals in Node so DOM-at-import code doesn't crash
        formatting: "minify",
        script: "async",
        includedRoutes: async (_paths: string[], routes: readonly RouteRecordRaw[]) => {
            const exclude = new Set([
                "/open",
                "/settings",
                "/bookmarks",
                "/explore",
                "/watch",
            ]);

            // Static public routes flagged for prerender (non-dynamic).
            const staticRoutes = routes
                .filter(
                    (r) =>
                        r.meta?.prerender &&
                        typeof r.path === "string" &&
                        !r.path.includes(":"),
                )
                .map((r) => r.path as string);

            const apiUrl = env.VITE_API_URL;
            if (!apiUrl) {
                // Fail fast: a partial build that silently drops pages is worse
                // than no build (Phase 1 spec §3.1).
                throw new Error("[ssg] VITE_API_URL is required for route enumeration");
            }

            const slugRoutes = (await fetchPublicSlugs(apiUrl)).map((s) => `/${s}`);

            const all = [...new Set([...staticRoutes, ...slugRoutes])].filter(
                (p) => !exclude.has(p),
            );
            console.log(
                `[ssg] prerendering ${all.length} routes ` +
                    `(${staticRoutes.length} static + ${slugRoutes.length} content)`,
            );
            prerenderedRoutes = all;
            return all;
        },
        onFinished: () => {
            writeSeoArtifacts();
        },
    },
};

export default defineConfig(config);
