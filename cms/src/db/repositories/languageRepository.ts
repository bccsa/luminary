import { type Uuid, type Language, DocType } from "@/types";
import { BaseRepository } from "./baseRepository";

export class LanguageRepository extends BaseRepository {
    find(id: Uuid) {
        return this.whereId(id).first() as unknown as Language;
    }

    findAll() {
        return this.whereType(DocType.Language).toArray((dtos) => dtos as Language[]);
    }
}
