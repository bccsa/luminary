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
 * Snapshot store for the PUBLIC content tier — the serialization target for the
 * web/SSG build.
 *
 * Flow (web build only):
 *  - Prerender (Node): a page's `onServerPrefetch` calls `ensureContentBySlug`,
 *    which fetches via the unauthenticated `/search` path and fills the store.
 *    vite-ssg then serializes `pinia.state.value` into the HTML.
 *  - Client: the snapshot is restored into the store BEFORE mount, so the first
 *    client render matches the prerendered HTML (clean hydration). `ensure*` is a
 *    no-op when the slug is already present, so no duplicate fetch is issued for
 *    snapshot data; liveness is layered on top by the component (ApiLiveQuery).
 *
 * This store holds ONLY public data and never per-user/private data.
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

    return { bySlug, altsBySlug, ensureContentBySlug };
});
