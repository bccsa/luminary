import {
    DocType,
    type CreatePostDto,
    type Post,
    type PostDto,
    type ContentDto,
    ContentStatus,
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
            type: DocType.Content,
            status: ContentStatus.Draft,
            updatedTimeUtc: Date.now(),
            language: dto.language._id,
            title: dto.title,
            memberOf: [],
        };

        const post: PostDto = {
            _id: postId,
            type: DocType.Post,
            updatedTimeUtc: Date.now(),
            image: dto.image,
            content: [contentId],
            memberOf: [],
            tags: [],
        };

        await db.docs.put(content);
        await db.docs.put(post);

        // Save change, which will be sent to the API later
        db.localChanges.put({
            reqId: uuidv4(),
            docId: contentId,
            doc: content,
        });
        return db.localChanges.put({
            reqId: uuidv4(),
            docId: postId,
            doc: postId,
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
}
