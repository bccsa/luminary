import type { DocType, TagType, PublishStatus, PostType, RedirectType } from "../types";

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
    parentType?: DocType;
    parentId?: Uuid;
    tags?: Uuid[];
    pinned?: number;
    language?: Uuid;
    tagType?: TagType;
    parentTagType?: TagType;
    parentTags?: Uuid[];
    parentPinned?: number;
};

export enum AclPermission {
    View = "view",
    Edit = "edit",
    Delete = "delete",
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
    default?: number;
    translations: Record<string, string>;
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
    seoTitle?: string;
    seoString?: string;
    parentType?: DocType;
    parentTags: Uuid[];
    parentImageData?: ImageDto;
    parentTagType?: TagType;
    parentPostType?: PostType;
    parentPublishDateVisible?: boolean;
    parentPinned?: number;
    parentTaggedDocs?: Uuid[];
    availableTranslations?: Uuid[];
};

export type ContentParentDto = ContentBaseDto & {
    imageData?: ImageDto;
    tags: Uuid[];
    publishDateVisible: boolean;
};

export type PostDto = ContentParentDto & {
    postType: PostType;
};

export type TagDto = ContentParentDto & {
    tagType: TagType;
    pinned: number;
    taggedDocs?: Uuid[]; // This field is set by the API
};

export type GroupDto = BaseDocumentDto & {
    type: DocType.Group;
    name: string;
    acl: GroupAclEntryDto[];
};

export type ImageDto = {
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

export type queryCacheDto<T extends BaseDocumentDto> = {
    id: string;
    result: T[];
};

export type RedirectDto = ContentBaseDto & {
    redirectType: RedirectType;
    slug: string;
    toSlug?: string;
};

export type ApiConnectionOptions = {
    /**
     * Socket.io endpoint URL
     */
    apiUrl?: string;
    /**
     * Access token
     */
    token?: string;
    /**
     * Force a reconnect to the server if the socket already exists
     */
    reconnect?: boolean;
    /**
     * Array of DocTypes passed to the shared library, that the client need to sync down
     */
    docTypes?: Array<apiDocTypes>;
};

type apiDocTypes = {
    type: DocType;
    contentOnly: boolean;
    syncPriority: number; // 10 is default, lower number is higher priority
};
