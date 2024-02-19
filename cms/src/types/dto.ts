import type { BaseDocument, DocType, Language } from "./cms";

export enum AckStatus {
    Accepted = "accepted",
    Rejected = "rejected",
}

export type Uuid = string;

export type BaseDocumentDto = {
    _id: string;
    type: DocType;
    updatedTimeUtc?: number;
};

export type ContentBaseDto = BaseDocumentDto & {
    memberOf: Uuid[];
};

export type ContentDto = ContentBaseDto & {
    language: Uuid;
    status: string;
    title: string;
    slug: string;
    publishDate?: number;
    expiryDate?: number;
    localisedImage?: Uuid;
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
    reqId: Uuid;
    type: DocType.ChangeReq;
    doc: any;
};

export type ChangeReqAckDto = {
    reqId: Uuid;
    type: DocType.ChangeReqAck;
    ack: AckStatus;
    message?: string;
    doc?: BaseDocumentDto;
};
