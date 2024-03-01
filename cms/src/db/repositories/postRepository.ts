import {
    DocType,
    type CreatePostDto,
    type Post,
    type PostDto,
    type ContentDto,
    ContentStatus,
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
            parentId: postId,
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
            tags: [],
            memberOf: ["group-private-content"], // TODO set right group
        };

        await db.docs.put(content);
        await db.docs.put(post);

        // Save change, which will be sent to the API later
        await db.localChanges.put({
            doc: post,
        });
        await db.localChanges.put({
            doc: content,
        });

        return postId;
    }

    async update(content: Content, post: Post) {
        const contentDto = this._contentRepository.toDto(content, post._id);
        const postDto = this.toDto(post);
        await db.docs.update(contentDto, contentDto);
        await db.docs.update(postDto, postDto);

        // Save change, which will be sent to the API later
        await db.localChanges.put({
            doc: postDto,
        });
        return db.localChanges.put({
            doc: contentDto,
        });
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

        return post;
    }

    private toDto(post: Post) {
        const dto = this.toBaseDto<PostDto>(post);
        return dto;
    }
}
