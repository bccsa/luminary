import type { DocType, TagType, PublishStatus } from "../types";

export enum AckStatus {
    Accepted = "accepted",
    Rejected = "rejected",
}

export type Uuid = string;

export type ApiDataResponseDto = {
    docs: BaseDocumentDto[];
    version?: number;
};

export type BaseDocumentDto = {
    _id: string;
    type: DocType;
    updatedTimeUtc: number;
    memberOf?: Uuid[];
    docType?: DocType;
    acl?: GroupAclEntryDto[];
    parentType?: DocType.Post | DocType.Tag;
    tags?: Uuid[];
    pinned?: boolean;
    language?: Uuid;
};

export enum AclPermission {
    View = "view",
    // Create = "create",
    Edit = "edit",
    // Delete = "delete",
    Assign = "assign",
    Translate = "translate",
    Publish = "publish",
}

export type GroupAclEntryDto = {
    type: DocType;
    groupId: Uuid;
    permission: AclPermission[];
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
    status: PublishStatus;
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
    parentType?: DocType;
    tags: Uuid[];
    image?: string;
};

export type ContentMetadataDto = {
    contentId: Uuid;
    languageId: Uuid;
    title: string;
    status: PublishStatus;
    publishDate?: number;
    expiryDate?: number;
};

export type PostDto = ContentBaseDto & {
    image: string;
    tags: Uuid[];
    metadata?: ContentMetadataDto[];
};

export type TagDto = PostDto & {
    tagType: TagType;
    pinned: boolean;
};

export type GroupDto = BaseDocumentDto & {
    type: DocType.Group;
    name: string;
    acl: GroupAclEntryDto[];
};

export type ImageDto = ContentBaseDto & {
    name: string;
    description: string;
    fileCollections: ImageFileCollectionDto[];
    uploadData?: ImageUploadDto[];
};

export type ImageFileCollectionDto = {
    aspectRatio: number;
    imageFiles: ImageFileDto[];
};

export type ImageFileDto = {
    width: number;
    height: number;
    filename: string;
};

export type ImageUploadDto = {
    fileData: ArrayBuffer;
    preset: string;
    filename?: string;
};

// export type CreateGroupDto = {
//     name: string;
//     acl?: GroupAclEntry[];
// };

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

export type LocalChangeDto = {
    id: number;
    doc: BaseDocumentDto;
    docId: Uuid;
};
