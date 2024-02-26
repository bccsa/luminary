import {
    DocType,
    type CreatePostDto,
    type Post,
    type PostDto,
    type ContentDto,
    ContentStatus,
    LocalChangeStatus,
    type Content,
} from "@/types";
import { ContentRepository } from "./contentRepository";
import { BaseRepository } from "./baseRepository";
import { db } from "../baseDatabase";
import { v4 as uuidv4 } from "uuid";

export class PostRepository extends BaseRepository {
    private _contentRepository: ContentRepository;

    constructor() {
        super();
        this._contentRepository = new ContentRepository();
    }

    async create(dto: CreatePostDto) {
        const contentId = uuidv4();
        const postId = uuidv4();

        const content: ContentDto = {
            _id: contentId,
            updatedTimeUtc: Date.now(),
            type: DocType.Content,
            status: ContentStatus.Draft,
            language: dto.language._id,
            title: dto.title,
            slug: `slug-${dto.title}`, // TODO create actual slug from title
            memberOf: ["group-private-content"], // TODO set right group
        };

        const post: PostDto = {
            _id: postId,
            updatedTimeUtc: Date.now(),
            type: DocType.Post,
            image: dto.image,
            content: [contentId],
            tags: [],
            memberOf: ["group-private-content"], // TODO set right group
        };

        await db.docs.put(content);
        await db.docs.put(post);

        // Save change, which will be sent to the API later
        db.localChanges.put({
            status: LocalChangeStatus.Unsynced,
            doc: post,
        });
        return db.localChanges.put({
            status: LocalChangeStatus.Unsynced,
            doc: content,
        });
    }

    async update(content: Content, post: Post) {
        const contentDto = this._contentRepository.toDto(content);
        const postDto = this.toDto(post);
        await db.docs.update(contentDto, contentDto);
        await db.docs.update(postDto, postDto);

        // Save change, which will be sent to the API later
        db.localChanges.put({
            status: LocalChangeStatus.Unsynced,
            doc: postDto,
        });
        return db.localChanges.put({
            status: LocalChangeStatus.Unsynced,
            doc: contentDto,
        });
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

    private toDto(post: Post): PostDto {
        const postDto = { ...post } as unknown as PostDto;

        postDto.content = post.content.map((c) => c._id);

        return postDto;
    }
}
