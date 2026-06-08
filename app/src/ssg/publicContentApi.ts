import type { ContentDto } from "luminary-shared";

/**
 * One-shot, unauthenticated reads of the PUBLIC content tier from the API's
 * `GET /search` endpoint.
 *
 * This is the single fetch path used by the web/SSG tier — it runs identically
 * in Node (build-time prerender snapshot) and in the browser (client). It sends
 * NO `Authorization` header, so the API resolves the anonymous identity and its
 * default ("public") group mappings, returning only published, public content.
 * It deliberately does NOT touch `luminary-shared` (no Dexie, no socket), so it
 * is safe to call during prerender.
 *
 * Note: `GET /search` is marked deprecated in `shared/src/rest/http.ts` in
 * favour of `POST /query`, but the live client still uses it, so the build uses
 * it too for parity. Revisit when the hybrid Mango query lands.
 */

export type PublicSearchQuery = {
    apiVersion?: string;
    limit?: number;
    offset?: number;
    sort?: Array<Record<string, "asc" | "desc">>;
    types?: string[];
    contentOnly?: boolean;
    slug?: string;
    parentId?: string;
    languages?: string[];
};

const API_URL = import.meta.env.VITE_API_URL;

export async function searchPublic<T = ContentDto>(query: PublicSearchQuery): Promise<T[]> {
    if (!API_URL) throw new Error("VITE_API_URL is not set; cannot fetch public content");

    const q = { apiVersion: "0.0.0", ...query };
    const res = await fetch(`${API_URL}/search`, {
        // No Authorization header → anonymous identity → public/default groups.
        headers: { "X-Query": JSON.stringify(q) },
    });

    if (!res.ok) {
        throw new Error(`public /search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { docs?: T[] };
    return data?.docs ?? [];
}

/**
 * Fetch a single published public content document by slug. Returns `null` when
 * no public content exists for that slug (e.g. a redirect-only slug or a private
 * doc that anonymous users cannot see).
 */
export async function fetchPublicContentBySlug(slug: string): Promise<ContentDto | null> {
    const docs = await searchPublic<ContentDto>({ slug });
    return docs.find((d) => (d as ContentDto).type === ("content" as ContentDto["type"])) ?? null;
}

/**
 * Fetch all public content translations (siblings) of a parent — i.e. the same
 * post/tag rendered in every available language. Used to emit reciprocal
 * hreflang alternates. `types:["content"]` is required (a bare parentId search
 * returns nothing).
 */
export async function fetchPublicTranslations(parentId: string): Promise<ContentDto[]> {
    const docs = await searchPublic<ContentDto>({ parentId, types: ["content"] });
    return docs.filter((d) => (d as ContentDto).type === ("content" as ContentDto["type"]));
}

/**
 * Map of language doc id → language code (e.g. "lang-fra" → "fr"), used to turn a
 * content doc's `language` into an hreflang code. Cached for the lifetime of the
 * build/page so it is fetched at most once.
 */
let _languageCodes: Promise<Record<string, string>> | undefined;

export function fetchPublicLanguageCodes(): Promise<Record<string, string>> {
    if (!_languageCodes) {
        _languageCodes = searchPublic<{ _id: string; languageCode?: string }>({
            types: ["language"],
        }).then((docs) => {
            const map: Record<string, string> = {};
            for (const l of docs) if (l._id && l.languageCode) map[l._id] = l.languageCode;
            return map;
        });
    }
    return _languageCodes;
}
