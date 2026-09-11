import type { Plugin } from "vite";

const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const EMPTY_SCRIPT = /<script\b([^>]*)>\s*<\/script>/gi;

type Attributes = Record<string, string>;

function parseAttributes(raw: string): Attributes {
    const attributes: Attributes = {};
    ATTRIBUTE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTRIBUTE.exec(raw)) !== null) {
        attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    return attributes;
}

// Escaping `<` keeps an attribute value from opening a tag inside the script this is inlined in.
function inlineJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

// Re-creating the tag from its own attributes keeps `crossorigin` (and anything else Vite
// adds later) identical to the tag it replaces, so the browser reuses the preloaded module
// instead of fetching it a second time.
function loaderScript(attributes: Attributes): string {
    return (
        `<script>(function(a){` +
        `function boot(){` +
        `var s=document.createElement("script");` +
        `for(var k in a)s.setAttribute(k,a[k]);` +
        // Vite hoists the entry into <head>, so the loader can run before <body> is parsed.
        `(document.body||document.head).appendChild(s)` +
        `}` +
        // A `setTimeout` scheduled from inside a frame callback runs after that frame has
        // painted. A hidden tab never paints and may never run the callback, so boot straight
        // away there rather than stalling hydration until the tab is looked at.
        `if(document.visibilityState==="hidden"||!window.requestAnimationFrame)setTimeout(boot,0);` +
        `else requestAnimationFrame(function(){setTimeout(boot,0)})` +
        `})(${inlineJson(attributes)});</script>`
    );
}

function preloadLink(attributes: Attributes): string {
    const crossorigin = "crossorigin" in attributes ? " crossorigin" : "";
    return `<link rel="modulepreload"${crossorigin} href="${attributes.src}">`;
}

/**
 * Boots the ES-module entry one frame after the browser has painted, so a prerendered page
 * shows its static HTML before hydration starts. The entry keeps downloading during head
 * parse via a `modulepreload` link, so only execution moves — not the fetch.
 *
 * Build-only, and pointless without prerendered markup to show: use it on the SSG target,
 * not on the SPA build, whose `#app` is empty until the entry runs.
 */
export function deferEntryUntilPainted(): Plugin {
    return {
        name: "defer-entry-until-painted",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html) {
                const preloads: string[] = [];
                const deferred = html.replace(EMPTY_SCRIPT, (tag, raw: string) => {
                    const attributes = parseAttributes(raw);
                    if (attributes.type !== "module" || !attributes.src) return tag;
                    preloads.push(preloadLink(attributes));
                    return loaderScript(attributes);
                });
                if (!preloads.length) return html;
                return deferred.includes("</head>")
                    ? deferred.replace("</head>", `${preloads.join("")}</head>`)
                    : preloads.join("") + deferred;
            },
        },
    };
}
