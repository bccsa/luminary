import type { Plugin } from "vite";

/**
 * Static boot splash for the SPA build. The app mounts only after the data layer and
 * auth have initialised, and the Vue splash lives inside App.vue — so without this
 * everything before mount paints an empty `#app`. Injected inside `#app` so Vue's
 * mount clears it; no teardown code to keep in step.
 *
 * Not wired into the web build (vite.config.web.ts), whose `#app` carries prerendered
 * content that must not be covered.
 */
const SPLASH_STYLE = `
#boot-splash {
    --boot-splash-bg: #ffffff;
    --boot-splash-fg: #d4d4d8;
    --boot-splash-track: #f4f4f5;
    --boot-splash-slug: #a1a1aa;
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--boot-splash-bg);
    font-family: ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
    #boot-splash {
        --boot-splash-bg: #0f172a;
        --boot-splash-fg: #71717a;
        --boot-splash-track: #d4d4d8;
        --boot-splash-slug: #71717a;
    }
}
html.dark #boot-splash {
    --boot-splash-bg: #0f172a;
    --boot-splash-fg: #71717a;
    --boot-splash-track: #d4d4d8;
    --boot-splash-slug: #71717a;
}
#boot-splash .boot-splash-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 0 1rem;
}
#boot-splash .boot-splash-label {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--boot-splash-fg);
    text-align: center;
}
#boot-splash .boot-splash-track {
    position: relative;
    height: 0.75rem;
    width: 80%;
    max-width: 28rem;
    overflow: hidden;
    border-radius: 9999px;
    background: var(--boot-splash-track);
}
#boot-splash .boot-splash-slug {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40%;
    border-radius: 9999px;
    background: var(--boot-splash-slug);
    animation: boot-splash-slug 1.2s linear infinite;
}
@keyframes boot-splash-slug {
    0% { left: -40%; }
    100% { left: 100%; }
}
@media (prefers-reduced-motion: reduce) {
    #boot-splash .boot-splash-slug { animation: none; left: 30%; }
}
#boot-splash .boot-splash-error { display: none; }
#boot-splash button {
    border-radius: 0.375rem;
    border: 1px solid var(--boot-splash-slug);
    background: transparent;
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
    color: var(--boot-splash-fg);
    cursor: pointer;
}
html[data-render-state="error"] #boot-splash .boot-splash-loading { display: none; }
html[data-render-state="error"] #boot-splash .boot-splash-error { display: flex; }
`;

const SPLASH_MARKUP = `<div id="boot-splash" role="status" aria-live="polite">
    <div class="boot-splash-panel boot-splash-loading">
        <p class="boot-splash-label">Loading...</p>
        <div class="boot-splash-track"><div class="boot-splash-slug"></div></div>
    </div>
    <div class="boot-splash-panel boot-splash-error">
        <p class="boot-splash-label">The app could not be started.</p>
        <button type="button" id="boot-splash-reload">Reload</button>
    </div>
</div>`;

// `?nosplash` is the existing opt-out honoured by `isAppLoading`; mirror it here so the
// query string suppresses the whole splash, not just the Vue half.
const SPLASH_SCRIPT = `(function () {
    var splash = document.getElementById("boot-splash");
    if (!splash) return;
    if (new URLSearchParams(window.location.search).has("nosplash")) {
        splash.remove();
        return;
    }
    var reload = document.getElementById("boot-splash-reload");
    if (reload) reload.addEventListener("click", function () { window.location.reload(); });
})();`;

export function bootSplash(): Plugin {
    return {
        name: "boot-splash",
        transformIndexHtml: {
            order: "pre",
            handler: (html) => ({
                html: html.replace('<div id="app"></div>', `<div id="app">${SPLASH_MARKUP}</div>`),
                tags: [
                    { tag: "style", injectTo: "head" as const, children: SPLASH_STYLE },
                    { tag: "script", injectTo: "body" as const, children: SPLASH_SCRIPT },
                ],
            }),
        },
    };
}
