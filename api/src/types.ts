/* -------------------------------------------------------
 * This file contains the central types
 * used by both the API, CMS and app.
 * ------------------------------------------------------- */

import { ChangeDto } from "./dto/ChangeDto";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { ContentDto } from "./dto/ContentDto";
import { GroupAclEntryDto } from "./dto/GroupAclEntryDto";
import { GroupDto } from "./dto/GroupDto";
import { LanguageDto } from "./dto/LanguageDto";
import { PostDto } from "./dto/PostDto";
import { TagDto } from "./dto/TagDto";
import { UserDto } from "./dto/UserDto";

/**
 * Database unique document ID
 */
export type Uuid = string;

/**
 * Document types
 */
export enum DocType {
    Post = "post",
    Content = "content",
    Tag = "tag",
    // TODO: Implement media DocTypes and DTO's for media docs
    // Image = "image",
    // Video = "video",
    // Audio = "Audio",
    // MediaDownload = "mediaDownload",
    User = "user",
    Language = "language",
    Group = "group",
    Change = "change",
    ChangeReq = "changeReq",
    ChangeReqAck = "changeReqAck",
}

/**
 * Acl permissions
 */
export enum AclPermission {
    View = "view",
    Assign = "assign",
    Edit = "edit",
    Translate = "translate",
    Publish = "publish",
    Delete = "delete",
}

/**
 * Acknowledge status used in AckDto
 */
export enum AckStatus {
    Accepted = "accepted",
    Rejected = "rejected",
}

/**
 * Content status used in Content documents
 */
export enum ContentStatus {
    Published = "published",
    Draft = "draft",
}

/**
 * Tag Type used in Tag documents
 */
export enum TagType {
    Category = "category",
    Topic = "topic",
}

/**
 * DocType to DTO map
 */
export const DocTypeMap = {
    change: ChangeDto,
    changeReq: ChangeReqDto,
    changeReqAck: ChangeReqAckDto,
    content: ContentDto,
    group: GroupDto,
    groupAclEntry: GroupAclEntryDto,
    language: LanguageDto,
    post: PostDto,
    tag: TagDto,
    user: UserDto,
};
