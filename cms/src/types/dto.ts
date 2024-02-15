import type { BaseDocument, DocType, Language } from "./cms";

export type Uuid = string;

export type BaseDocumentDto = BaseDocument;

export type ContentBaseDto = BaseDocumentDto & {
    memberOf: Uuid[];
};

export type ContentDto = ContentBaseDto & {
    language: Uuid;
    status: string;
    title: string;
    publishDate?: number;
    expiryDate?: number;
    localisedImage?: Uuid;
    slug?: string;
    audio?: Uuid;
    video?: Uuid;
    author?: string;
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

export type CreatePostDto = {
    image: string;
    language: Language;
    title: string;
};

export type ChangeReqDto = {
    docId: Uuid;
    type: DocType.ChangeReq;
    doc: any;
};
