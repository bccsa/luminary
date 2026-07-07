import {
    AclPermission,
    db,
    DocType,
    PublishStatus,
    RedirectType,
    type ContentDto,
    type RedirectDto,
    type Uuid,
    verifyAccess,
} from "luminary-shared";

/** A candidate redirect paired with the `_id` of the Content translation it was derived from. */
export type RedirectCandidate = {
    redirect: RedirectDto;
    contentId: Uuid;
};

/**
 * Compute the redirects to create when content slugs change: one Permanent redirect
 * (old slug → new slug) per translation that
 * - is and was Published (and currently live: not scheduled, not expired),
 * - had its slug changed, and
 * - the user has Redirect-edit access to.
 *
 * Each candidate is paired with the `_id` of the Content doc it came from, so a caller that
 * rejects a candidate (e.g. a slug uniqueness pre-check) can revert that specific translation's
 * slug edit. Returns new `RedirectDto`s; the inputs are not mutated.
 */
export function buildRedirects(
    editableContent: ContentDto[],
    existingContent: ContentDto[],
): RedirectCandidate[] {
    const redirects: RedirectCandidate[] = [];
    const now = Date.now();

    for (const content of editableContent) {
        if (content.deleteReq) continue;

        const existing = existingContent.find((c) => c._id === content._id && !c.deleteReq);
        if (!existing) continue;
        if (content.slug === existing.slug) continue;
        if (!verifyAccess(content.memberOf, DocType.Redirect, AclPermission.Edit)) continue;
        if (
            existing.status !== PublishStatus.Published ||
            content.status !== PublishStatus.Published
        )
            continue;
        if (
            (content.publishDate && content.publishDate > now) ||
            (existing.publishDate && existing.publishDate > now)
        )
            continue;
        if (
            (content.expiryDate && content.expiryDate <= now) ||
            (existing.expiryDate && existing.expiryDate <= now)
        )
            continue;

        redirects.push({
            contentId: content._id,
            redirect: {
                _id: db.uuid(),
                type: DocType.Redirect,
                updatedTimeUtc: now,
                memberOf: [...content.memberOf],
                slug: existing.slug,
                redirectType: RedirectType.Permanent,
                toSlug: content.slug,
            },
        });
    }

    return redirects;
}
