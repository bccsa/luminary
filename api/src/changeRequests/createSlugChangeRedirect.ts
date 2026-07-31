import { randomUUID } from "crypto";
import { DbService } from "../db/db.service";
import { ContentDto } from "../dto/ContentDto";
import { RedirectDto } from "../dto/RedirectDto";
import { AclPermission, DocType, PublishStatus, RedirectType, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import processRedirectDto from "./documentProcessing/processRedirectDto";

type Result = { info?: string; warning?: string };

/**
 * Recognise the inverse of the redirect this workflow creates. For A→B followed by a
 * content rename B→A, the redirect at A must be removed as part of the successful content
 * update. Other redirect collisions are left to processContentDto's invariant guard.
 */
export async function findSlugReversionRedirect(
    doc: ContentDto,
    prevDoc: ContentDto | undefined,
    groupMembership: Uuid[],
    db: DbService,
): Promise<RedirectDto | undefined> {
    if (!prevDoc || doc.deleteReq || prevDoc.deleteReq || doc.slug === prevDoc.slug) return;
    if (doc.status !== PublishStatus.Published || prevDoc.status !== PublishStatus.Published)
        return;
    if (
        !PermissionSystem.verifyAccess(
            prevDoc.memberOf,
            DocType.Redirect,
            AclPermission.Edit,
            groupMembership,
            "any",
        )
    )
        return;

    const redirects = (await db.getDocsBySlug(doc.slug, DocType.Redirect)) as RedirectDto[];
    return redirects.find((redirect) => !redirect.deleteReq && redirect.toSlug === prevDoc.slug);
}

export async function createSlugChangeRedirect(
    userId: string,
    doc: ContentDto,
    prevDoc: ContentDto | undefined,
    groupMembership: Uuid[],
    db: DbService,
): Promise<Result | undefined> {
    const now = Date.now();

    if (doc.deleteReq || prevDoc?.deleteReq) return;
    if (!prevDoc || doc.slug === prevDoc.slug) return;
    if (doc.status !== PublishStatus.Published || prevDoc.status !== PublishStatus.Published)
        return;
    if (
        (doc.publishDate && doc.publishDate > now) ||
        (prevDoc.publishDate && prevDoc.publishDate > now)
    )
        return;
    if (
        (doc.expiryDate && doc.expiryDate <= now) ||
        (prevDoc.expiryDate && prevDoc.expiryDate <= now)
    )
        return;
    if (
        !PermissionSystem.verifyAccess(
            doc.memberOf,
            DocType.Redirect,
            AclPermission.Edit,
            groupMembership,
            "any",
        )
    )
        return;

    const description = `redirect from "${prevDoc.slug}" to "${doc.slug}"`;
    const redirect: RedirectDto = {
        _id: randomUUID(),
        type: DocType.Redirect,
        updatedTimeUtc: now,
        updatedBy: userId,
        memberOf: [...doc.memberOf],
        slug: prevDoc.slug,
        redirectType: RedirectType.Permanent,
        toSlug: doc.slug,
    };

    try {
        const slugIsUnique = await db.checkUniqueSlug(prevDoc.slug, redirect._id, DocType.Redirect);
        if (!slugIsUnique) {
            return { warning: `Could not create ${description}: a redirect already exists.` };
        }

        await processRedirectDto(redirect);
        await db.upsertDoc(redirect);
        return { info: `Created a ${description}` };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { warning: `Could not create ${description}: ${message}` };
    }
}
