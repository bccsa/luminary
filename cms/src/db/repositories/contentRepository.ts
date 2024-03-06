import { type ContentDto, type Uuid, type Content, ContentStatus, DocType } from "@/types";
import { BaseRepository } from "./baseRepository";
import { LanguageRepository } from "./languageRepository";
import { DateTime } from "luxon";
import { db } from "../baseDatabase";
import { v4 as uuidv4 } from "uuid";

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

    async create(values: Partial<ContentDto>) {
        const contentId = uuidv4();
        const content = {
            ...values,
            _id: contentId,
            updatedTimeUtc: Date.now(),
            type: DocType.Content,
            status: ContentStatus.Draft,
            slug: `slug-${values.title}`, // TODO create actual slug from title
            memberOf: ["group-private-content"], // TODO set right group
        };

        await db.docs.put(content);

        await db.localChanges.put({
            doc: content,
        });

        return contentId;
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
