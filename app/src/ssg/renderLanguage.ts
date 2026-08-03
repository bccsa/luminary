import { inject, type InjectionKey } from "vue";
import { appDisplayLanguageIdsAsRef } from "@/globalConfig";
import { isPrerender } from "./isPrerender";

/**
 * The language priority for the page currently being prerendered.
 *
 * On the client this is `appDisplayLanguageIdsAsRef` — a module-level ref, which is correct
 * there because a browser tab renders one page at a time and the user really can change
 * language at runtime. The prerender is the opposite on both counts: the language is fixed for
 * the page, and several pages render concurrently in one process. Reading the shared ref there
 * means whichever render most recently wrote it wins, so a page can fetch another page's
 * language and record its dependency keys under it.
 *
 * Provided on the app instance instead, which vite-ssg creates once per route — so it is
 * per-render by construction, with no global to race on.
 */
export const SSG_DISPLAY_LANGUAGES = Symbol("ssgDisplayLanguages") as InjectionKey<string[]>;

/**
 * Same shape as `appDisplayLanguageIdsAsRef`: the render language followed by the default as a
 * fallback, so content with no translation in the chosen language still resolves.
 */
export function ssgDisplayLanguages(renderLang: string, defaultLang?: string): string[] {
    return [renderLang, defaultLang].filter(
        (id, index, all): id is string => !!id && all.indexOf(id) === index,
    );
}

/**
 * Resolve the display languages for this render. Call during `setup()` (injection is only
 * available there); the returned getter may be called later, including inside an async hook.
 * Falls back to the shared ref on the client and in any non-prerender context.
 */
export function useDisplayLanguageIds(): () => string[] {
    const provided = isPrerender() ? inject(SSG_DISPLAY_LANGUAGES, null) : null;
    return () => provided ?? appDisplayLanguageIdsAsRef.value;
}
