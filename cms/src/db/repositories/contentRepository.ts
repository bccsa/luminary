import { type ContentDto, type Uuid, type Content } from "@/types";
import { BaseRepository } from "./baseRepository";
import { LanguageRepository } from "./languageRepository";

export class ContentRepository extends BaseRepository {
    private _languageRepository: LanguageRepository;

    constructor() {
        super();
        this._languageRepository = new LanguageRepository();
    }

    getContentWithParentId(id: Uuid) {
        return this.whereParentId(id).toArray((content) => {
            return Promise.all(this.fromDtos(content as ContentDto[]));
        });
    }

    private fromDtos(dtos: ContentDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: ContentDto) {
        const content = dto as unknown as Content;

        content.updatedTimeUtc = new Date(content.updatedTimeUtc);
        content.publishDate = content.publishDate ? new Date(content.publishDate) : undefined;
        content.expiryDate = content.expiryDate ? new Date(content.expiryDate) : undefined;

        content.language = await this._languageRepository.find(dto.language);

        return content;
    }

    toDto(content: Content, postId: Uuid) {
        const contentDto = { ...content } as unknown as ContentDto;

        contentDto.parentId = postId;
        contentDto.updatedTimeUtc = content.updatedTimeUtc.getTime();

        contentDto.language = content.language._id;
        contentDto.publishDate = content.publishDate ? content.publishDate.getTime() : undefined;
        contentDto.expiryDate = content.expiryDate ? content.expiryDate.getTime() : undefined;

        return contentDto;
    }
}
