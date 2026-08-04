/**
 * Render-diagnostics reporter — the app-bundle side of the `globalThis.__SSG_RENDER_ISSUES__`
 * bridge. Mirrors {@link dependencyCapture}'s pattern: the Vite config and the SSR app
 * bundle are separate module realms, so the collector lives on `globalThis` and this module
 * only reports into it. `reportRenderIssue` no-ops unless a capture is active, so the same
 * call site is harmless on the client / normal SPA.
 *
 * Collected issues are drained by `vite.config.web.ts` after the prerender completes; any
 * recorded issue fails the build (unless `SSG_STRICT=0`), turning silent query failures into
 * loud build errors instead of missing page sections.
 */

export type RenderIssue = {
    route: string;
    kind: "query-failed" | "provably-empty";
    detail: string;
};

const GLOBAL_KEY = "__SSG_RENDER_ISSUES__";

function capture(): RenderIssue[] | undefined {
    return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as RenderIssue[] | undefined;
}

/**
 * Report a render issue encountered while prerendering `route`. No-op unless a capture
 * is active (i.e. only during the SSG prerender) — safe to call from fetchers that also
 * run on the client / normal SPA build.
 */
export function reportRenderIssue(issue: RenderIssue): void {
    const state = capture();
    if (!state) return;
    state.push(issue);
}

/**
 * Drains and returns all recorded render issues. Called by the Vite config after the
 * prerender completes. Returns an empty array when no capture is active.
 */
export function takeRenderIssues(): RenderIssue[] {
    const state = capture();
    if (!state) return [];
    const issues = [...state];
    state.length = 0;
    return issues;
}