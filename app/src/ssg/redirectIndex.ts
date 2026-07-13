export type SsgRedirectIndex = Record<string, string>;

type PublicRedirectDoc = {
    _id?: string;
    slug?: string;
    toSlug?: string;
    deleteReq?: number;
};

export function buildRedirectIndex(docs: PublicRedirectDoc[]): SsgRedirectIndex {
    const index: SsgRedirectIndex = {};
    for (const doc of docs) {
        if (!doc._id || !doc.slug || !doc.toSlug || doc.deleteReq) continue;
        index[doc._id] = doc.slug;
    }
    return index;
}
