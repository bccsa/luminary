import { DocType, type TagDto, type Tag, type Uuid, type Content } from "@/types";
import { ContentRepository } from "./contentRepository";
import { BaseRepository } from "./baseRepository";
import { db } from "../baseDatabase";

export class TagRepository extends BaseRepository {
    private _contentRepository: ContentRepository;

    constructor() {
        super();
        this._contentRepository = new ContentRepository();
    }

    async update(content: Content, tag: Tag) {
        const contentDto = this._contentRepository.toDto(content, tag._id);
        const tagDto = this.toDto(tag);

        await db.docs.put(contentDto);
        await db.docs.put(tagDto);

        // Save change, which will be sent to the API later
        await db.localChanges.put({
            doc: tagDto,
        });
        return db.localChanges.put({
            doc: contentDto,
        });
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

        dto.tags = tag.tags.map((t) => t._id);

        return dto;
    }
}
