import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";
import type { Plugin } from "vite";
import { PAGE_FILES, isPageRequest } from "./youtubeEmbedPaths";

const source = new URL("../src/youtube-embed/", import.meta.url);

/**
 * `youtube-embed.html`, the page that plays a YouTube video for the app (see `src/youtube-embed/page.ts`): its
 * markup with its script compiled from TypeScript and minified, and its styles minified, into one small file.
 */
export async function renderYouTubeEmbedPage(): Promise<string> {
    const [template, bundled] = await Promise.all([
        readFile(new URL("page.html", source), "utf8"),
        build({
            entryPoints: [fileURLToPath(new URL("page.ts", source))],
            bundle: true,
            minify: true,
            write: false,
            format: "iife",
            target: "es2017",
            legalComments: "none",
        }),
    ]);
    const style = /<style>([\s\S]*?)<\/style>/.exec(template);
    const css = style
        ? (await transform(style[1], { loader: "css", minify: true })).code.trim()
        : "";
    const script = bundled.outputFiles[0].text.trim().replace(/<\/script/gi, "<\\/script");
    return template
        .replace(style?.[0] ?? "", style ? `<style>${css}</style>` : "")
        .replace("<!--lmc-script-->", `<script>${script}</script>`)
        .replace(/\n\s*/g, "");
}

/** Serves the page in development and writes it beside the app's other files in a build. */
export function youtubeEmbedPage(): Plugin {
    let ssr = false;
    return {
        name: "youtube-embed-page",
        configResolved(config) {
            ssr = !!config.build.ssr;
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!isPageRequest(request.url)) return next();
                renderYouTubeEmbedPage().then(
                    (page) => {
                        response.setHeader("Content-Type", "text/html; charset=utf-8");
                        response.end(page);
                    },
                    (error: Error) => next(error),
                );
            });
        },
        async generateBundle() {
            if (ssr) return;
            const source = await renderYouTubeEmbedPage();
            for (const fileName of PAGE_FILES) this.emitFile({ type: "asset", fileName, source });
        },
    };
}
