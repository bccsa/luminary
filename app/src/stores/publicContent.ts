import { defineStore } from "pinia";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";
import {
    fetchPublicContentBySlug,
    fetchPublicLanguageCodes,
    fetchPublicTranslations,
} from "@/ssg/publicContentApi";

/** A reciprocal hreflang alternate: a language code + the slug of that translation. */
export type HreflangAlternate = { code: string; slug: string };

/**
 * Snapshot store for SingleContent's per-slug data on the web/SSG build — the
 * article doc + its reciprocal hreflang alternates. Feeds and reference data are no
 * longer cached here: they ride shared's response cache (`writeResponseCache` /
 * `useHybridQuery({cache:true})`), which the build primes per page.
 *
 * Flow (web build only):
 *  - Prerender (Node): a page's `onServerPrefetch` calls `ensureContentBySlug`, which
 *    fetches via the unauthenticated `/search` path and fills the store. vite-ssg then
 *    serializes `pinia.state.value` into the HTML.
 *  - Client: the snapshot is restored before mount so the first render matches.
 *    `ensure*` is a no-op when the slug is already present.
 *
 * Holds ONLY public data, never per-user/private data. (Slated to fold into the
 * response-cache seam in Phase 3.)
 */
export const usePublicContentStore = defineStore("publicContent", () => {
    // `undefined` = not fetched yet; `null` = fetched, no public content found.
    const bySlug = ref<Record<string, ContentDto | null>>({});
    // Reciprocal hreflang alternates per slug (other-language versions of the same doc).
    const altsBySlug = ref<Record<string, HreflangAlternate[]>>({});

    async function ensureContentBySlug(slug: string): Promise<void> {
        if (slug in bySlug.value) return; // no-op when already present (snapshot or prior fetch)

        const doc = await fetchPublicContentBySlug(slug);
        bySlug.value[slug] = doc;

        // Build reciprocal hreflang alternates from the doc's sibling translations.
        if (doc?.parentId) {
            const [siblings, codeById] = await Promise.all([
                fetchPublicTranslations(doc.parentId),
                fetchPublicLanguageCodes(),
            ]);
            altsBySlug.value[slug] = siblings
                .filter((s) => s.slug && codeById[s.language])
                .map((s) => ({ code: codeById[s.language], slug: s.slug }));
        }
    }

    return {
        bySlug,
        altsBySlug,
        ensureContentBySlug,
    };
});
