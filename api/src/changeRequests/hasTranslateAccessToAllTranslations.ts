import { DbService } from "../db/db.service";
import { AclPermission, DocType, Uuid } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";
import { ContentDto } from "../dto/ContentDto";
import { PermissionSystem } from "../permissions/permissions.service";

/**
 * Check if the user has 'Translate' access to the languages of all content documents belonging to a post / tag.
 */
export async function hasTranslateAccessToAllTranslations(
    parentId: Uuid,
    groupMembership: Array<Uuid>,
    dbService: DbService,
): Promise<boolean> {
    const contentDocs = await dbService.getContentByParentId(parentId);
    const contentLanguageIds = contentDocs.docs.map((d) => (d as ContentDto).language);
    const contentLanguages = await dbService.getDocs(contentLanguageIds, [DocType.Language]);

    return contentLanguages.docs.every((language) => {
        const l = language as unknown as LanguageDto;
        return PermissionSystem.verifyAccess(
            l.memberOf,
            DocType.Language,
            AclPermission.Translate,
            groupMembership,
            "any",
        );
    });
}
