import { DocType, type Post, type PostDto } from "@/types";
import { ContentRepository } from "./contentRepository";
import { BaseRepository } from "./baseRepository";

export class PostRepository extends BaseRepository {
    private _contentRepository: ContentRepository;

    constructor() {
        super();
        this._contentRepository = new ContentRepository();
    }

    async findAll() {
        return this.whereType(DocType.Post).toArray((dtos) =>
            Promise.all(this.fromDtos(dtos as PostDto[])),
        );
    }

    private fromDtos(dtos: PostDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: PostDto) {
        const post = dto as unknown as Post;

        if (dto.content.length > 0) {
            post.content = await this._contentRepository.getContentWithIds(dto.content);
        }

        return post;
    }
}
