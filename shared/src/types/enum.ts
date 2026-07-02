export enum DocType {
    Content = "content",
    Group = "group",
    Language = "language",
    Redirect = "redirect",
    Post = "post",
    Tag = "tag",
    User = "user",
    DeleteCmd = "deleteCmd",
    Storage = "storage",
    Crypto = "crypto",
    AuthProvider = "authProvider",
    AutoGroupMappings = "autoGroupMappings",
}

export enum PublishStatus {
    Draft = "draft",
    Published = "published",
}

export enum TagType {
    AudioPlaylist = "audioPlaylist",
    Category = "category",
    Topic = "topic",
}

export enum PostType {
    Blog = "blog",
    Page = "page",
}

export enum RedirectType {
    Permanent = "permanent",
    Temporary = "temporary",
}

export enum DeleteReason {
    Deleted = "deleted",
    PermissionChange = "permissionChange",
    StatusChange = "statusChange",
}

export enum StorageType {
    Image = "image",
    Media = "media",
}

export enum StorageStatus {
    Connected = "connected",
    Unreachable = "unreachable",
    Unauthorized = "unauthorized",
    NotFound = "not-found",
    NoCredential = "no-credentials",
    Checking = "checking",
    Unknown = "unknown",
}

export enum AckStatus {
    Accepted = "accepted",
    Rejected = "rejected",
}

export enum AclPermission {
    View = "view",
    Edit = "edit",
    Delete = "delete",
    Assign = "assign",
    Translate = "translate",
    Publish = "publish",
    // Access to view documents in the CMS, including drafts and expired content.
    // Gates all CMS-scoped (cms:true) reads/sync; the app uses plain View (published only).
    CmsView = "cmsView",
}

export enum MediaType {
    Audio = "audio",
    Video = "video",
}

export enum MediaPreset {
    Speech = "speech",
    Music = "music",
    Default = "default",
}
