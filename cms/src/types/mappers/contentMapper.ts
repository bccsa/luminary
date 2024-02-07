import { db } from "@/db";
import type { Content, ContentDto, Language } from "../";

export function fromDtos(dtos: ContentDto[]) {
    return dtos.map((dto) => fromDto(dto));
}

export async function fromDto(dto: ContentDto) {
    const content = dto as unknown as Content;

    content.language = (await db.docs
        .where("_id")
        .equals(dto.language)
        .first()) as unknown as Language;

    return content;
}
