export enum DocType {
    Content = "content",
    Group = "group",
    Language = "language",
    Redirect = "redirect",
    Post = "post",
    Tag = "tag",
    User = "user",
    DeleteCmd = "deleteCmd",
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

export enum MediaType {
    Audio = "audio",
    Video = "video",
}

export enum MediaPreset {
    Speech = "speech",
    Music = "music",
    Default = "default",
}
