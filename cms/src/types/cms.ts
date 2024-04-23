import type { DateTime } from "luxon";
import type { AclPermission, BaseDocumentDto, Uuid } from "./dto";

export enum DocType {
    Change = "change",
    Content = "content",
    Group = "group",
    Language = "language",
    Media = "media",
    MediaDownload = "mediaDownload",
    Post = "post",
    Tag = "tag",
    User = "user",
}

export type BaseDocument = {
    _id: string;
    type: DocType;
    updatedTimeUtc: DateTime;
};

export type Group = BaseDocument & {
    type: DocType.Group;
    name: string;
    acl: GroupAclEntry[];
};

export type GroupAclEntry = {
    type: DocType;
    groupId: Uuid;
    permission: AclPermission[];
};

export type ContentBase = BaseDocument & {
    memberOf: Uuid[];
};

export type Language = ContentBase & {
    type: DocType.Language;
    languageCode: string;
    name: string;
};

export enum MediaType {
    Audio = "audio",
    Image = "image",
    Video = "video",
}

export type Media = ContentBase & {
    type: DocType.Media;
    mediaType: MediaType;
    url: string;
};

export type MediaDownload = ContentBase & {
    type: DocType.MediaDownload;
    language: Language;
    url: string;
};

export type Audio = Media & {
    mediaType: MediaType.Audio;
    downloads: MediaDownload[];
};

export type Image = Media & {
    mediaType: MediaType.Image;
};

export type Video = Media & {
    mediaType: MediaType.Video;
    downloads: MediaDownload[];
};

export enum ContentStatus {
    Draft = "draft",
    Published = "published",
}

export type Content = ContentBase & {
    type: DocType.Content;
    parentId: Uuid;
    language: Language;
    status: ContentStatus;
    publishDate?: DateTime;
    expiryDate?: DateTime;
    slug: string;
    title: string;
    localisedImage?: string;
    author?: string;
    summary?: string;
    text?: string;
    audio?: string;
    video?: string;
};

export enum TagType {
    AudioPlaylist = "audioPlaylist",
    Category = "category",
    Topic = "topic",
}

export type Tag = ContentBase & {
    type: DocType.Tag;
    tagType: TagType;
    image: string;
    content: Content[];
    pinned: boolean;
    tags: Tag[];
};

export type Post = ContentBase & {
    type: DocType.Post;
    content: Content[];
    image: string;
    tags: Tag[];
};

export type User = ContentBase & {
    type: DocType.User;
    name: string;
    email: string;
};

export type LocalChange = {
    id: number;
    doc: BaseDocumentDto;
};

export type Notification = {
    id?: number;
    title: string;
    description?: string;
    state?: "success" | "error" | "info";
};
