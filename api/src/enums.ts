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
    User = "user",
    Language = "language",
    Redirect = "redirect",
    Group = "group",
    Change = "change",
    DeleteCmd = "deleteCmd",
    Storage = "storage",
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
     * Access to edit documents
     */
    Edit = "edit",

    /**
     * Access to delete documents
     */
    Delete = "delete",

    /**
     * Access to assign tags to documents
     */
    Assign = "assign",

    /**
     * Access to translate documents
     */
    Translate = "translate",

    /**
     * Access to publish documents
     */
    Publish = "publish",
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
    AudioPlaylist = "audioPlaylist",
}

/**
 * Post Type used in Post documents
 */
export enum PostType {
    Blog = "blog",
    Page = "page",
}

/**
 * Redirect Type used in Redirect Documents
 */
export enum RedirectType {
    Permanent = "permanent",
    Temporary = "temporary",
}

/**
 * Delete command reason
 */
export enum DeleteReason {
    Deleted = "deleted",
    PermissionChange = "permissionChange",
    StatusChange = "statusChange",
}

/**
 * Bucket Type used in S3Bucket documents
 */
export enum BucketType {
    Image = "image",
    Media = "media",
}
