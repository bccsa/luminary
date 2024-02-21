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
}

/**
 * Acl permissions
 */
export enum AclPermission {
    /**
     * Access to view documents
     */
    View = "view",

    /**
     * Access to assign tags to documents
     */
    Assign = "assign",

    /**
     * Access to edit documents
     */
    Edit = "edit",

    /**
     * Access to translate documents
     */
    Translate = "translate",

    /**
     * Access to publish documents
     */
    Publish = "publish",

    /**
     * Access to delete documents
     */
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
 * Publish status used in Content documents
 */
export enum PublishStatus {
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
