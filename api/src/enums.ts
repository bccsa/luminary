/* -------------------------------------------------------
 * This file contains central types and enumerators
 * ------------------------------------------------------- */

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
 * Acknowledge status used in ChangeAckDto
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
