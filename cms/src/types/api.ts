enum DocType {
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

type BaseDocument = {
    _id: string;
    type: DocType;
    updatedTimeUtc: number;
};

type Group = BaseDocument & {
    type: DocType.Group;
    name: string;
};

type ContentBase = BaseDocument & {
    memberOf: Group[];
};

type Language = ContentBase & {
    type: DocType.Language;
    languageCode: string;
    name: string;
};

enum MediaType {
    Audio = "audio",
    Image = "image",
    Video = "video",
}

type Media = ContentBase & {
    type: DocType.Media;
    mediaType: MediaType;
    url: string;
};

type MediaDownload = ContentBase & {
    type: DocType.MediaDownload;
    language: Language;
    url: string;
};

type Audio = Media & {
    mediaType: MediaType.Audio;
    downloads: MediaDownload[];
};

type Image = Media & {
    mediaType: MediaType.Image;
};

type Video = Media & {
    mediaType: MediaType.Video;
    downloads: MediaDownload[];
};

enum ContentStatus {
    Draft = "draft",
    Published = "published",
}

type Content = ContentBase & {
    type: DocType.Content;
    language: Language;
    status: ContentStatus;
    publishDate: number;
    expiryDate: number;
    localisedImage?: Image;
    slug: string;
    title: string;
    summary: string;
    text: string;
};

enum TagType {
    AudioPlaylist = "audioPlaylist",
    Category = "category",
    Topic = "topic",
}

type Tag = ContentBase & {
    type: DocType.Tag;
    tagType: TagType;
    image: Image;
    content: Content[];
    pinned: boolean;
    tags: Tag[];
};

type Post = ContentBase & {
    type: DocType.Post;
    content: Content[];
    image: Image;
    tags: Tag[];
};

type User = ContentBase & {
    type: DocType.User;
    name: string;
    email: string;
};
