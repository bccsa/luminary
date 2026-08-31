/**
 * The startup splash is plain HTML in `index.html` so it can paint before any module runs.
 * `main.ts` removes it by this id once the app is ready; the marked block is what
 * `stripBootSplash` drops.
 */
export const BOOT_SPLASH_ID = "bootSplash";

const BOOT_SPLASH_BLOCK = /[ \t]*<!-- boot-splash:start -->[\s\S]*?<!-- boot-splash:end -->\n?/g;

/**
 * Remove the splash from an `index.html`. The web build ships already-rendered HTML, so it has
 * no blank boot to cover and would otherwise bake a full-screen overlay into every static page.
 */
export function stripBootSplash(html: string): string {
    return html.replace(BOOT_SPLASH_BLOCK, "");
}
