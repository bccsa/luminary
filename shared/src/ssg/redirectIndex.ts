import { RedirectType } from "../types";
import { redirectStatus } from "./redirectHtml";

/**
 * Redirect id → { slug, status } sidecar (`dist-web/ssg-redirect-index.json`). A
 * redirect DeleteCmd only carries the doc id, not the slug its static file was written
 * under, so this lets a deleted/retargeted redirect's stale `<slug>.html` be found.
 * `status` (301/302, from `redirectType` — see `redirectHtml.ts`) rides along so the
 * deploy repo's serving layer can apply the real HTTP status without re-fetching the doc.
 */
export type SsgRedirectIndex = Record<string, { slug: string; status: 301 | 302 }>;

type PublicRedirectDoc = {
    _id?: string;
    slug?: string;
    toSlug?: string;
    deleteReq?: number;
    redirectType?: RedirectType;
};

/** Indexes only active (non-deleted, fully-formed) redirect docs by id. */
export function buildRedirectIndex(docs: PublicRedirectDoc[]): SsgRedirectIndex {
    const index: SsgRedirectIndex = {};
    for (const doc of docs) {
        if (!doc._id || !doc.slug || !doc.toSlug || doc.deleteReq) continue;
        index[doc._id] = {
            slug: doc.slug,
            status: redirectStatus(doc.redirectType ?? RedirectType.Temporary),
        };
    }
    return index;
}
