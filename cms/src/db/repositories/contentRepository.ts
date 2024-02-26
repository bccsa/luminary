import { type ContentDto, type Uuid, type Content } from "@/types";
import { BaseRepository } from "./baseRepository";
import { LanguageRepository } from "./languageRepository";

export class ContentRepository extends BaseRepository {
    private _languageRepository: LanguageRepository;

    constructor() {
        super();
        this._languageRepository = new LanguageRepository();
    }

    getContentWithIds(ids: Uuid[]) {
        return this.whereIds(ids).toArray((content) => {
            return Promise.all(this.fromDtos(content as ContentDto[]));
        });
    }

    private fromDtos(dtos: ContentDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: ContentDto) {
        const content = dto as unknown as Content;

        content.language = await this._languageRepository.find(dto.language);

        return content;
    }

    toDto(content: Content) {
        const contentDto = { ...content } as unknown as ContentDto;

        contentDto.language = content.language._id;

        return contentDto;
    }
}
