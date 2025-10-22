import type {
    DocType,
    TagType,
    PublishStatus,
    PostType,
    RedirectType,
    DeleteReason,
    MediaType,
    MediaPreset,
} from "../types";

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
    _rev?: string;
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
    deleteReq?: number;
    updatedBy?: string;
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

export type DeleteCmdDto = BaseDocumentDto & {
    docId: Uuid;
    docType: DocType;
    deleteReason: DeleteReason;
    memberOf?: Uuid[];
    newMemberOf?: Uuid[];
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

export type UserDto = ContentBaseDto & {
    type: DocType.User;
    email: string;
    name: string;
    lastLogin?: number;
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
    parentMedia?: MediaDto;
};

export type ContentParentDto = ContentBaseDto & {
    imageData?: ImageDto;
    tags: Uuid[];
    publishDateVisible: boolean;
    media?: MediaDto;
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

export type ImageUnprocessedDto = {
    fileIndex: string;
    preset: string;
    filename?: string;
};

export type ImageUploadDto = {
    fileData: ArrayBuffer;
    preset: string;
    filename?: string;
};

export type MediaDto = {
    hlsUrl?: string;
    fileCollections: MediaFileDto[];
    uploadData?: MediaUploadDataDto[];
};

export type MediaFileDto = {
    languageId: string;
    fileUrl: string;
    bitrate: number;
    mediaType: MediaType;
    processingProgress?: number;
};

export type MediaUploadDataDto = {
    fileData: ArrayBuffer;
    mediaType: MediaType;
    preset?: MediaPreset;
    languageId?: string;
};

export type ChangeReqDto = {
    id: number;
    doc: BaseDocumentDto;
};

export type ChangeReqAckDto = {
    id: number;
    ack: AckStatus;
    message?: string;
    warnings?: string[];
    docs?: any[];
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

/**
 * This type is an exact copy of the API's DbQueryResult, which is passed to the client when querying the Search API endpoint
 */
export type ApiQueryResult<T> = {
    docs: Array<T>;
    warnings?: Array<string>;
    version?: number;
    blockStart?: number;
    blockEnd?: number;
    group?: string;
    type?: DocType;
    contentOnly?: boolean;
};
