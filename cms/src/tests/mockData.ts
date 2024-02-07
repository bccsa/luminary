import {
    DocType,
    type ContentDto,
    type PostDto,
    type Content,
    ContentStatus,
    type Post,
    type Language,
} from "@/types";

export const mockPostDto: PostDto = {
    _id: "post-post1",
    type: DocType.Post,
    updatedTimeUtc: 3,
    memberOf: ["group-public-content"],
    content: ["content-post1-eng"],
    image: "",
    tags: ["tag-category1", "tag-topicA"],
};

export const mockContentDto: ContentDto = {
    _id: "content-post1-eng",
    type: DocType.Content,
    updatedTimeUtc: 3,
    memberOf: ["group-public-content"],
    language: "lang-eng",
    status: "published",
    slug: "post1-eng",
    title: "Post 1",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
    localisedImage: "",
    audio: "",
    video: "",
    publishDate: 3,
    expiryDate: 0,
};

export const mockLanguage: Language = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 3,
    memberOf: [],
    languageCode: "eng",
    name: "English",
};

export const mockContent: Content = {
    _id: "content-post1-eng",
    type: DocType.Content,
    updatedTimeUtc: 3,
    memberOf: [],
    language: mockLanguage,
    status: ContentStatus.Published,
    slug: "post1-eng",
    title: "English translation title",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: 3,
    expiryDate: 0,
};

export const mockPost: Post = {
    type: DocType.Post,
    _id: "post-post1",
    updatedTimeUtc: 3,
    memberOf: [],
    content: [mockContent],
    tags: [],
};
