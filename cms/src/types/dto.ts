import type { BaseDocument } from "./cms";

export type Uuid = string;

export type BaseDocumentDto = BaseDocument;

export type ContentBaseDto = BaseDocumentDto & {
    memberOf: Uuid[];
};

export type ContentDto = ContentBaseDto & {
    type: string;
    language: Uuid;
    status: string;
    publishDate: number;
    expiryDate?: number;
    localisedImage?: Uuid;
    slug: string;
    title: string;
    summary?: string;
    text?: string;
};

export type TagDto = ContentBaseDto & {
    pinned: boolean;
    image: string;
    content: Uuid[];
    tags: Uuid[];
};

export type PostDto = ContentBaseDto & {
    content: Uuid[];
    image: string;
    tags: Uuid[];
};
