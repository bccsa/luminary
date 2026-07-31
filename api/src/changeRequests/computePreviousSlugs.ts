import { ContentDto } from "../dto/ContentDto";
import { PublishStatus } from "../enums";

/**
 * Only a published→published rename has a live URL worth preserving — a draft (or a
 * not-yet-live / already-expired doc) has nothing a crawler or bookmark could be
 * pointing at. Mirrors the guards the old per-rename Redirect-doc creation used.
 */
export function isTrackableSlugChange(doc: ContentDto, prevDoc?: ContentDto): prevDoc is ContentDto {
    if (!prevDoc || doc.deleteReq || prevDoc.deleteReq) return false;
    if (doc.slug === prevDoc.slug) return false;
    if (doc.status !== PublishStatus.Published || prevDoc.status !== PublishStatus.Published)
        return false;

    const now = Date.now();
    if ((doc.publishDate && doc.publishDate > now) || (prevDoc.publishDate && prevDoc.publishDate > now))
        return false;
    if ((doc.expiryDate && doc.expiryDate <= now) || (prevDoc.expiryDate && prevDoc.expiryDate <= now))
        return false;

    return true;
}

/**
 * Folds a slug rename into this doc's own `previousSlugs` history: the vacated slug is
 * appended, and any entry matching the *new* slug is dropped (renaming back to a slug
 * that was previously redirected away from makes it live again, so it's no longer
 * "previous"). Pure — the uniqueness check against other live docs/redirects is the
 * caller's job (`processContentDto`), since that needs `db`.
 */
export function foldPreviousSlugs(doc: ContentDto, prevDoc: ContentDto): string[] {
    const carried = (prevDoc.previousSlugs ?? []).filter((s) => s !== doc.slug);
    return [...carried, prevDoc.slug];
}
