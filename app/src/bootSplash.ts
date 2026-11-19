/**
 * The startup splash, as plain HTML/CSS/JS injected into `index.html` by
 * `vite-plugins/bootSplash.ts`. The app mounts only after the data layer and auth have
 * initialised, so without this everything before mount paints an empty `#app`.
 *
 * It sits outside `#app` rather than inside it, so it survives `app.mount()` and covers the
 * wait for `initLanguage()` too; `main.ts` removes it by `BOOT_SPLASH_ID` once the app has
 * rendered. Tailwind is not loaded this early, so the colours and metrics that mirror
 * `LoadingBar.vue` are written out longhand.
 */
export const BOOT_SPLASH_ID = "boot-splash";

/** Mirrors the `?nosplash` opt-out `isAppLoading` honours, applied before first paint. */
export const BOOT_SPLASH_OFF_CLASS = "boot-splash-off";

/** Shipped in `public/`, so this URL resolves from any route depth. */
export const DEFAULT_BOOT_LOGO = "/logo.svg";

/**
 * A configured logo is only usable here if the browser can resolve it from any route and the
 * build actually publishes it. A path into the source tree (the `.env.example` default) meets
 * neither, so it falls back to the copy in `public/`.
 */
export function resolveBootLogo(configured?: string): string {
    if (!configured) return DEFAULT_BOOT_LOGO;
    const usable = /^(?:https?:)?\/\//.test(configured) || configured.startsWith("/");
    return usable ? configured : DEFAULT_BOOT_LOGO;
}

const escapeAttribute = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The error panel is driven purely by the `data-render-state` attribute `renderState.ts`
 * already writes, so a failed boot needs no teardown coordination in `main.ts` — which never
 * reaches its removal call on that path.
 */
export function bootSplashStyle(): string {
    return `
#${BOOT_SPLASH_ID} {
    --boot-splash-bg: #ffffff;
    --boot-splash-fg: #71717a;
    --boot-splash-track: #e4e4e7;
    --boot-splash-slug: #71717a;
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--boot-splash-bg);
    font-family: ui-sans-serif, system-ui, sans-serif;
}
html.dark #${BOOT_SPLASH_ID} {
    --boot-splash-bg: #0f172a;
    --boot-splash-fg: #94a3b8;
    --boot-splash-track: #334155;
    --boot-splash-slug: #94a3b8;
}
html.${BOOT_SPLASH_OFF_CLASS} #${BOOT_SPLASH_ID} { display: none; }
#${BOOT_SPLASH_ID} .boot-splash-panel {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 0 1rem;
}
#${BOOT_SPLASH_ID} .boot-splash-logo { width: 18rem; max-width: 80%; }
#${BOOT_SPLASH_ID} .boot-splash-label {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--boot-splash-fg);
    text-align: center;
}
#${BOOT_SPLASH_ID} .boot-splash-track {
    position: relative;
    height: 0.75rem;
    width: 80%;
    max-width: 28rem;
    overflow: hidden;
    border-radius: 9999px;
    background: var(--boot-splash-track);
}
#${BOOT_SPLASH_ID} .boot-splash-slug {
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
    #${BOOT_SPLASH_ID} .boot-splash-slug { animation: none; left: 30%; }
}
#${BOOT_SPLASH_ID} button {
    border-radius: 0.375rem;
    border: 1px solid var(--boot-splash-slug);
    background: transparent;
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
    color: var(--boot-splash-fg);
    cursor: pointer;
}
#${BOOT_SPLASH_ID} .boot-splash-error { display: none; }
html[data-render-state="error"] #${BOOT_SPLASH_ID} .boot-splash-loading { display: none; }
html[data-render-state="error"] #${BOOT_SPLASH_ID} .boot-splash-error { display: flex; }
`.trim();
}

/**
 * The loading panel carries no text: the splash paints long before i18n, whose messages come
 * from Language documents fetched at runtime.
 */
export function bootSplashMarkup(configuredLogo?: string): string {
    const logo = escapeAttribute(resolveBootLogo(configuredLogo));
    return `<div id="${BOOT_SPLASH_ID}" role="status" aria-live="polite">
    <div class="boot-splash-panel boot-splash-loading">
        <img class="boot-splash-logo" src="${logo}" alt="" />
        <div class="boot-splash-track"><div class="boot-splash-slug"></div></div>
    </div>
    <div class="boot-splash-panel boot-splash-error">
        <p class="boot-splash-label">The app could not be started.</p>
        <button type="button" id="boot-splash-reload">Reload</button>
    </div>
</div>`;
}

/**
 * Runs during head parse, before the splash paints. The theme resolution mirrors
 * `globalConfig`'s, so an explicit light/dark choice wins over the OS preference — a
 * `prefers-color-scheme` media query alone would paint the wrong theme for those users.
 */
export function bootSplashPrePaintScript(): string {
    return `(function () {
    var el = document.documentElement;
    try {
        var theme = localStorage.getItem("theme");
        if (theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
            el.classList.add("dark");
        }
    } catch (e) {}
    try {
        if (new URLSearchParams(window.location.search).has("nosplash")) {
            el.classList.add("${BOOT_SPLASH_OFF_CLASS}");
        }
    } catch (e) {}
})();`;
}

/** The only route out of the error panel, which `main.ts` cannot reach to wire up itself. */
export function bootSplashReloadScript(): string {
    return `(function () {
    var button = document.getElementById("boot-splash-reload");
    if (button) button.addEventListener("click", function () { window.location.reload(); });
})();`;
}

/** Inline in the dev HTML so even errors loading the module graph can be displayed. */
export function bootDiagnosticsScript(): string {
    return `(function () {
    var panel;
    var failure = "";
    var started = Date.now();
    var root = document.documentElement;
    function cleanup() {
        clearInterval(timer);
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        window.removeEventListener("render-state-change", update);
        if (panel) panel.remove();
    }
    function update() {
        if (root.dataset.renderState === "ready") { cleanup(); return; }
        if (!document.body) return;
        if (!failure && root.dataset.renderState !== "error" && Date.now() - started < 8000) return;
        if (!panel) {
            panel = document.createElement("pre");
            panel.id = "boot-diagnostics";
            panel.setAttribute("role", "status");
            panel.style.cssText = "position:fixed;bottom:16px;left:16px;right:16px;z-index:10000;margin:0;padding:16px;max-height:40vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#18181b;color:#fff;border-radius:8px;font:14px/1.5 monospace";
            document.body.appendChild(panel);
        }
        var stage = root.dataset.bootStage || "Loading application scripts";
        panel.textContent = "Development startup details\\nStep: " + stage + "\\n" +
            (failure ? "Error: " + failure : root.dataset.renderState === "error" ? "Startup failed. See the browser console for details." : "Still waiting (" + Math.floor((Date.now() - started) / 1000) + "s).");
    }
    function onError(event) {
        if (event.message) { failure = event.message; update(); }
    }
    function onRejection(event) {
        var reason = event.reason;
        failure = reason && reason.message ? reason.message : String(reason);
        update();
    }
    var timer = setInterval(update, 1000);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("render-state-change", update);
    return cleanup;
})();`;
}
