import type { DocType, GroupAclEntry, Language, TagType } from "./cms";

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
};

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

export type GroupDto = BaseDocumentDto & {
    type: DocType.Group;
    name: string;
    acl: GroupAclEntry[];
};

export type ImageDto = ContentBaseDto & {
    name: string;
    description: string;
    files: ImageFileDto[];
    uploadData?: ImageUploadDto;
};

export type ImageFileDto = {
    width: number;
    height: number;
    aspectRatio: number;
    filename: string;
};

export type ImageUploadDto = {
    fileData: Buffer;
    preset: string;
    filename?: string;
};

export type CreateGroupDto = {
    name: string;
    acl?: GroupAclEntry[];
};

export type CreateContentParentDto = {
    image: string;
    language: Language;
    title: string;
};

export type CreateTagDto = CreateContentParentDto & {
    tagType: TagType;
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

export enum AclPermission {
    View = "view",
    Create = "create",
    Edit = "edit",
    Delete = "delete",
    Assign = "assign",
    Translate = "translate",
    Publish = "publish",
}

export type AccessMap = {
    [T: Uuid]: { [U in DocType]?: { [V in AclPermission]?: boolean | undefined } };
};

export type DocGroupAccess = { [a in DocType]?: Uuid[] };
