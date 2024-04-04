import { type ContentDto, type Uuid, type Content, DocType } from "@/types";
import { BaseRepository } from "./baseRepository";
import { LanguageRepository } from "./languageRepository";
import { DateTime } from "luxon";

export class ContentRepository extends BaseRepository {
    private _languageRepository: LanguageRepository;

    constructor() {
        super();
        this._languageRepository = new LanguageRepository();
    }

    async getAll() {
        return this.whereType(DocType.Content).toArray((dtos) =>
            Promise.all(this.fromDtos(dtos as ContentDto[])),
        );
    }

    getContentWithParentId(id: Uuid) {
        return this.whereParentId(id, DocType.Content).toArray((content) => {
            return Promise.all(this.fromDtos(content as ContentDto[]));
        });
    }

    private fromDtos(dtos: ContentDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: ContentDto) {
        const content = this.fromBaseDto<Content>(dto);

        content.publishDate = dto.publishDate ? DateTime.fromMillis(dto.publishDate) : undefined;
        content.expiryDate = dto.expiryDate ? DateTime.fromMillis(dto.expiryDate) : undefined;

        content.language = await this._languageRepository.find(dto.language);

        return content;
    }

    toDto(content: Content, postId: Uuid) {
        const dto = this.toBaseDto<ContentDto>(content);

        dto.parentId = postId;
        dto.language = content.language._id;

        dto.publishDate = content.publishDate ? content.publishDate.toMillis() : undefined;
        dto.expiryDate = content.expiryDate ? content.expiryDate.toMillis() : undefined;

        return dto;
    }
}
