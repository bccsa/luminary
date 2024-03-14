import type { DocType, Language, TagType } from "./cms";

export enum AckStatus {
    Accepted = "accepted",
    Rejected = "rejected",
}

export type Uuid = string;

export type BaseDocumentDto = {
    _id: string;
    type: DocType;
    updatedTimeUtc: number;
};

export type ContentBaseDto = BaseDocumentDto & {
    memberOf: Uuid[];
};

export type LanguageDto = ContentBaseDto & {
    type: DocType.Language;
    languageCode: string;
    name: string;
};

export type ContentDto = ContentBaseDto & {
    parentId: Uuid;
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
    tagType: TagType;
    pinned: boolean;
    image: string;
    tags: Uuid[];
};

export type PostDto = ContentBaseDto & {
    image: string;
    tags: Uuid[];
};

export type CreateContentParentDto = {
    image: string;
    language: Language;
    title: string;
};

export type ChangeReqDto = {
    id: number;
    doc: BaseDocumentDto;
};

export type ChangeReqAckDto = {
    id: number;
    ack: AckStatus;
    message?: string;
    doc?: any;
};
