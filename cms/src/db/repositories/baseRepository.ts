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

    protected fromBaseDto<T extends BaseDocument>(dto: BaseDocumentDto) {
        const domainObject = dto as unknown as T;

        domainObject.updatedTimeUtc = DateTime.fromMillis(dto.updatedTimeUtc);

        return domainObject;
    }

    protected toBaseDto<T extends BaseDocumentDto>(obj: BaseDocument) {
        const dto = { ...obj } as unknown as T;

        dto.updatedTimeUtc = obj.updatedTimeUtc.toMillis();

        return dto;
    }
}
