import type { DocType, Language, TagType } from "./cms";

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
    type: DocType.Group;
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
    Assign = "assign",
    Edit = "edit",
    Translate = "translate",
    Publish = "publish",
    Delete = "delete",
}

// export type AccessMap = Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>;
export type AccessMap = {
    [a: Uuid]: { [b in DocType]?: { [c in AclPermission]?: boolean | undefined } };
};

export type DocGroupAccess = { [a in DocType]?: Uuid[] };
