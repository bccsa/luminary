import { DocType, type Post, type PostDto } from "@/types";
import { ContentRepository } from "./contentRepository";
import { BaseRepository } from "./baseRepository";
import { TagRepository } from "./tagRepository";

export class PostRepository extends BaseRepository {
    private _contentRepository: ContentRepository;
    private _tagRepository: TagRepository;

    constructor() {
        super();
        this._contentRepository = new ContentRepository();
        this._tagRepository = new TagRepository();
    }

    async getAll() {
        return this.whereType(DocType.Post).toArray((dtos) =>
            Promise.all(this.fromDtos(dtos as PostDto[])),
        );
    }

    private fromDtos(dtos: PostDto[]) {
        return dtos.map((dto) => this.fromDto(dto));
    }

    private async fromDto(dto: PostDto) {
        const post = this.fromBaseDto<Post>(dto);

        post.content = await this._contentRepository.getContentWithParentId(dto._id);
        post.tags = await this._tagRepository.getTagsWithIds(dto.tags);

        return post;
    }

    private toDto(post: Post) {
        const dto = this.toBaseDto<PostDto>(post);

        dto.tags = post.tags.map((t) => t._id);

        return dto;
    }
}
