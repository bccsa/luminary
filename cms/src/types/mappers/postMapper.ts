import { db } from "@/db";
import type { Content, Post, PostDto } from "../";

export function fromDtos(dtos: PostDto[]) {
    return dtos.map((dto) => fromDto(dto));
}

export async function fromDto(dto: PostDto) {
    const post = dto as unknown as Post;

    if (dto.content.length > 0) {
        post.content = await db.docs
            .where("_id")
            .anyOf(dto.content)
            .toArray((content) => {
                return content as unknown as Content[];
            });
    }

    return post;
}
