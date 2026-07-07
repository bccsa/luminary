import { randomUUID } from "crypto";
import { DbService } from "../db/db.service";
import { ContentDto } from "../dto/ContentDto";
import { RedirectDto } from "../dto/RedirectDto";
import { AclPermission, DocType, PublishStatus, RedirectType, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import processRedirectDto from "./documentProcessing/processRedirectDto";

type Result = { info?: string; warning?: string };

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
