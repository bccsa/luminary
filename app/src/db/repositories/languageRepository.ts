import { type Uuid, type Language, DocType, type LanguageDto } from "@/types";
import { BaseRepository } from "./baseRepository";

export class LanguageRepository extends BaseRepository {
    find(id: Uuid) {
        return this.whereId(id).first() as unknown as Language;
    }

    getAll() {
        return this.whereType(DocType.Language).toArray((dtos) =>
            Promise.all(this.fromDtos(dtos as LanguageDto[])),
        );
    }

    private fromDtos(dtos: LanguageDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: LanguageDto) {
        const language = this.fromBaseDto<Language>(dto);
        return language;
    }
}
