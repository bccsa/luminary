/**
 * Redirect id → slug sidecar (`dist-web/ssg-redirect-index.json`). A redirect
 * DeleteCmd only carries the doc id, not the slug its static file was written
 * under, so this lets a deleted/retargeted redirect's stale `<slug>.html` be found.
 */
export type SsgRedirectIndex = Record<string, string>;

type PublicRedirectDoc = {
    _id?: string;
    slug?: string;
    toSlug?: string;
    deleteReq?: number;
};

/** Indexes only active (non-deleted, fully-formed) redirect docs by id. */
export function buildRedirectIndex(docs: PublicRedirectDoc[]): SsgRedirectIndex {
    const index: SsgRedirectIndex = {};
    for (const doc of docs) {
        if (!doc._id || !doc.slug || !doc.toSlug || doc.deleteReq) continue;
        index[doc._id] = doc.slug;
    }
    return index;
}
