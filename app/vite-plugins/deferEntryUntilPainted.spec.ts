import { describe, expect, it } from "vitest";
import type { IndexHtmlTransformHook, Plugin } from "vite";
import { deferEntryUntilPainted } from "./deferEntryUntilPainted";

function transformHandler(plugin: Plugin): IndexHtmlTransformHook {
    const hook = plugin.transformIndexHtml;
    if (!hook) throw new Error("Expected deferEntryUntilPainted to provide transformIndexHtml");
    if (typeof hook === "function") return hook;
    return "handler" in hook ? hook.handler : hook.transform;
}

function transform(html: string): string {
    const result = transformHandler(deferEntryUntilPainted()).call({} as never, html, {
        path: "/index.html",
        filename: "index.html",
    });
    if (typeof result !== "string") throw new Error("Expected the handler to return HTML");
    return result;
}

const ENTRY = '<script type="module" crossorigin src="/assets/index-abc123.js"></script>';
const BUILT_HTML =
    "<!doctype html><html><head>" +
    '<link rel="modulepreload" crossorigin href="/assets/vendor-def456.js">' +
    "</head><body>" +
    '<div id="app" data-server-rendered="true"><h1>Prerendered</h1></div>' +
    ENTRY +
    "</body></html>";

/**
 * Run the emitted loader against a fake document/window and return the tag it appends,
 * plus the callbacks it scheduled — the plugin's contract is "one frame later", which is
 * only observable by driving those callbacks by hand.
 */
function runLoader(html: string, visibilityState = "visible", body: boolean = true) {
    const inline = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!inline) throw new Error("Expected an inline loader script");

    const appended: { attributes: Record<string, string> }[] = [];
    const frames: (() => void)[] = [];
    const timeouts: (() => void)[] = [];
    const parent = {
        appendChild: (el: { attributes: Record<string, string> }) => appended.push(el),
    };
    const document = {
        visibilityState,
        createElement: () => {
            const element = {
                attributes: {} as Record<string, string>,
                setAttribute(name: string, value: string) {
                    element.attributes[name] = value;
                },
            };
            return element;
        },
        head: parent,
        body: body ? parent : null,
    };
    const window = { requestAnimationFrame: (cb: () => void) => frames.push(cb) };
    new Function("document", "window", "requestAnimationFrame", "setTimeout", inline[1])(
        document,
        window,
        window.requestAnimationFrame,
        (cb: () => void) => timeouts.push(cb),
    );

    return {
        appended,
        frames,
        timeouts,
        drain() {
            frames.splice(0).forEach((cb) => cb());
            timeouts.splice(0).forEach((cb) => cb());
        },
    };
}

describe("deferEntryUntilPainted", () => {
    it("replaces the module entry with an inline loader", () => {
        const html = transform(BUILT_HTML);

        expect(html).not.toContain(ENTRY);
        expect(html).toContain('<div id="app" data-server-rendered="true">');
    });

    it("keeps the entry downloading during head parse", () => {
        const html = transform(BUILT_HTML);

        expect(html).toContain(
            '<link rel="modulepreload" crossorigin href="/assets/index-abc123.js"></head>',
        );
        // The chunk preloads Vite emitted are left where they were.
        expect(html).toContain(
            '<link rel="modulepreload" crossorigin href="/assets/vendor-def456.js">',
        );
    });

    it("omits crossorigin from the preload when the entry tag has none", () => {
        const html = transform(
            '<html><head></head><body><script type="module" src="/assets/index-abc123.js"></script></body></html>',
        );

        expect(html).toContain('<link rel="modulepreload" href="/assets/index-abc123.js">');
    });

    it("boots the entry only after a frame has painted", () => {
        const loader = runLoader(transform(BUILT_HTML));

        expect(loader.appended).toHaveLength(0);
        expect(loader.frames).toHaveLength(1);

        loader.drain();

        expect(loader.appended).toHaveLength(1);
        expect(loader.appended[0].attributes).toEqual({
            type: "module",
            crossorigin: "",
            src: "/assets/index-abc123.js",
        });
    });

    it("falls back to head when body has not been parsed yet", () => {
        const loader = runLoader(transform(BUILT_HTML), "visible", false);

        loader.drain();

        expect(loader.appended).toHaveLength(1);
    });

    it("boots without waiting for a frame in a hidden tab", () => {
        const loader = runLoader(transform(BUILT_HTML), "hidden");

        expect(loader.frames).toHaveLength(0);

        loader.drain();

        expect(loader.appended).toHaveLength(1);
    });

    it("leaves HTML without a module entry untouched", () => {
        const html = "<html><head></head><body><script>var a=1</script></body></html>";

        expect(transform(html)).toBe(html);
    });

    it("leaves non-module and inline scripts alone", () => {
        const html = transform(
            "<html><head></head><body>" +
                '<script src="/legacy.js"></script>' +
                ENTRY +
                "</body></html>",
        );

        expect(html).toContain('<script src="/legacy.js"></script>');
        expect(html).not.toContain(ENTRY);
    });

    it("does not run on the dev server", () => {
        expect(deferEntryUntilPainted().apply).toBe("build");
    });

    it("escapes `<` in the src it inlines", () => {
        const html = transform(
            '<html><head></head><body><script type="module" src="/a<b.js"></script></body></html>',
        );

        expect(html).toContain("\\u003cb.js");
    });
});

// Guards the assumption the plugin is built on: vite-ssg's own entry rewrite only matches a
// literal `<script type="module" `, which the loader no longer emits.
describe("vite-ssg script-mode interaction", () => {
    it("leaves nothing for vite-ssg's async/defer rewrite to match", () => {
        const html = transform(BUILT_HTML);

        expect(html).not.toMatch(/<script type="module" /);
    });
});
