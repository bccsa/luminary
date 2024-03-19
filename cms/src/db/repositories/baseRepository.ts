import { DocType, type BaseDocumentDto, type Uuid, type BaseDocument } from "@/types";
import { db } from "../baseDatabase";
import { DateTime } from "luxon";

export class BaseRepository {
    whereType(docType: DocType) {
        return db.docs.where("type").equals(docType);
    }

    whereId(id: Uuid) {
        return db.docs.where("_id").equals(id);
    }

    whereIds(ids: Uuid[]) {
        return db.docs.where("_id").anyOf(ids);
    }

    whereParentId(parentId: Uuid) {
        return db.docs.where("parentId").equals(parentId);
    }

    whereParentIds(parentIds: Uuid[]) {
        return db.docs.where("parentId").anyOf(parentIds);
    }

    whereLanguageIds(languageIds: Uuid[]) {
        return db.docs.where("language").anyOf(languageIds);
    }

    /**
     * Return a list of documents and change documents of specified DocType that are NOT members of the given groupIds
     */
    whereNotMemberOf(groupIds: Array<Uuid>, docType: DocType) {
        // Query groups and group changeDocs
        if (docType === DocType.Group) {
            return db.docs.filter(
                (group) =>
                    (group.type === DocType.Group ||
                        (group.type === DocType.Change && group.docType === DocType.Group)) &&
                    group.acl! &&
                    !group.acl.some(
                        (acl) =>
                            acl.type === DocType.Group &&
                            groupIds.includes(acl.groupId) &&
                            acl.permission.some((p) => p === "view"),
                    ),
            );
        }

        // Query other documents
        return db.docs.filter(
            (doc) =>
                doc.memberOf !== undefined &&
                (doc.type === docType || (doc.type == DocType.Change && doc.docType == docType)) &&
                !doc.memberOf.some((groupId) => groupIds.includes(groupId)),
        );
    }

    protected fromBaseDto<T extends BaseDocument>(dto: BaseDocumentDto) {
        const domainObject = dto as unknown as T;

        domainObject.updatedTimeUtc = DateTime.fromMillis(dto.updatedTimeUtc);

        return domainObject;
    }

    protected toBaseDto<T extends BaseDocumentDto>(obj: BaseDocument) {
        const dto = { ...obj } as unknown as T;

        dto.updatedTimeUtc = obj.updatedTimeUtc.toMillis();
        // @ts-ignore Content does not always exist, but make sure it's undefined
        delete dto.content;

        return dto;
    }
}
