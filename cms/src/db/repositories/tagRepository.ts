import { DocType, type TagDto, type Tag, type Uuid } from "@/types";
import { ContentRepository } from "./contentRepository";
import { BaseRepository } from "./baseRepository";

export class TagRepository extends BaseRepository {
    private _contentRepository: ContentRepository;

    constructor() {
        super();
        this._contentRepository = new ContentRepository();
    }

    async getAll() {
        return this.whereType(DocType.Tag).toArray((dtos) =>
            Promise.all(this.fromDtos(dtos as TagDto[])),
        );
    }

    async getTagsWithIds(ids: Uuid[]) {
        return this.whereIds(ids).toArray((dtos) => Promise.all(this.fromDtos(dtos as TagDto[])));
    }

    private fromDtos(dtos: TagDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: TagDto) {
        const tag = this.fromBaseDto<Tag>(dto);

        tag.content = await this._contentRepository.getContentWithParentId(dto._id);
        tag.tags = await this.getTagsWithIds(dto.tags);

        return tag;
    }

    private toDto(tag: Tag) {
        const dto = this.toBaseDto<TagDto>(tag);
        return dto;
    }
}
