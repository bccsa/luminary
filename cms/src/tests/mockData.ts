import {
    DocType,
    type ContentDto,
    type PostDto,
    type Content,
    ContentStatus,
    type Post,
    type Language,
    type LocalChange,
    type LanguageDto,
    TagType,
    type Tag,
    type TagDto,
    type Group,
    AclPermission,
} from "@/types";
import { DateTime } from "luxon";

export const mockCategoryDto: TagDto = {
    _id: "tag-category1",
    type: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    tagType: TagType.Category,
    pinned: false,
    image: "",
    tags: [],
};

export const mockPostDto: PostDto = {
    _id: "post-post1",
    type: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    image: "",
    tags: ["tag-category1"],
};

export const mockEnglishContentDto: ContentDto = {
    _id: "content-post1-eng",
    type: DocType.Content,
    parentId: "post-post1",
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    language: "lang-eng",
    status: "published",
    slug: "post1-eng",
    title: "Post 1",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "<p>In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.</p>",
    localisedImage: "",
    audio: "",
    video: "",
    publishDate: 1704114000000,
    expiryDate: undefined,
};
export const mockFrenchContentDto: ContentDto = {
    _id: "content-post1-fra",
    type: DocType.Content,
    parentId: "post-post1",
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    language: "lang-fra",
    status: "published",
    slug: "post1-fra",
    title: "Post 1",
    summary: "Ceci est un exemple de publication.",
    author: "ChatGPT",
    text: "<p>Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l'aider. Lily s'accrocha à l'espoir alors qu'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté.</p>",
    localisedImage: "",
    audio: "",
    video: "",
    publishDate: 1704114000000,
    expiryDate: undefined,
};
export const mockCategoryContentDto: ContentDto = {
    _id: "content-tag-category1",
    type: DocType.Content,
    parentId: "tag-category1",
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    language: "lang-eng",
    status: ContentStatus.Published,
    slug: "content-tag-category1",
    title: "Category 1",
    summary: "Example tag",
    text: "<p>A category.</p>",
    publishDate: 1704114000000,
};

export const mockLanguageEng: Language = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    languageCode: "eng",
    name: "English",
};
export const mockLanguageFra: Language = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    languageCode: "fra",
    name: "Français",
};
export const mockLanguageSwa: Language = {
    _id: "lang-swa",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    languageCode: "swa",
    name: "Swahili",
};

export const mockLanguageDtoEng: LanguageDto = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    languageCode: "eng",
    name: "English",
};
export const mockLanguageDtoFra: LanguageDto = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    languageCode: "fra",
    name: "Français",
};

export const mockEnglishContent: Content = {
    _id: "content-post1-eng",
    parentId: "post-post1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "post1-eng",
    title: "English translation title",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "<p>In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.</p>",
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    expiryDate: undefined,
};
export const mockFrenchContent: Content = {
    _id: "content-post1-fra",
    parentId: "post-post1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageFra,
    status: ContentStatus.Draft,
    slug: "post1-fra",
    title: "French translation title",
    summary: "Ceci est un exemple de publication.",
    author: "ChatGPT",
    text: "<p>Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l'aider. Lily s'accrocha à l'espoir alors qu'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté.</p>",
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    expiryDate: undefined,
};

export const mockUnpublishableContent: Content = {
    _id: "content-post1-eng",
    parentId: "post-post1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Draft,
    slug: "post1-eng",
    title: "English translation title",
    summary: undefined,
    author: undefined,
    text: undefined,
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: undefined,
    expiryDate: undefined,
};

export const mockEnglishCategoryContent: Content = {
    _id: "content-tag-category1",
    parentId: "tag-category1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-category1",
    title: "Category 1",
    summary: "Example tag",
    text: "<p>A category.</p>",
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockFrenchCategoryContent: Content = {
    _id: "content-tag-category1-fra",
    parentId: "tag-category1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageFra,
    status: ContentStatus.Published,
    slug: "content-tag-category1-fra",
    title: "Categorie 1",
    summary: "Tag example",
    text: "<p>Un categorie.</p>",
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockTopicContent: Content = {
    _id: "content-tag-topicA",
    parentId: "tag-topicA",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-topicA",
    title: "Topic A",
    summary: "Another example tag",
    text: "<p>A topic.</p>",
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockAudioPlaylistContent: Content = {
    _id: "content-tag-audioPlaylist-Faith",
    parentId: "tag-audioPlaylist-Faith",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-audioPlaylist-Faith",
    title: "Faith",
    summary: "A playlist about faith",
    text: "<p>An audio playlist.</p>",
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockCategory: Tag = {
    _id: "tag-category1",
    type: DocType.Tag,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    tagType: TagType.Category,
    pinned: false,
    image: "image.jpg",
    tags: [],
    content: [mockEnglishCategoryContent, mockFrenchCategoryContent],
};
export const mockTopic: Tag = {
    _id: "tag-topicA",
    type: DocType.Tag,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    tagType: TagType.Topic,
    pinned: false,
    image: "image.jpg",
    tags: [],
    content: [mockTopicContent],
};
export const mockAudioPlaylist: Tag = {
    _id: "tag-audioPlaylist-Faith",
    type: DocType.Tag,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    tagType: TagType.AudioPlaylist,
    pinned: false,
    image: "image.jpg",
    tags: [],
    content: [mockAudioPlaylistContent],
};

export const mockPost: Post = {
    type: DocType.Post,
    _id: "post-post1",
    image: "test.jpg",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    content: [mockEnglishContent, mockFrenchContent],
    tags: [mockCategory],
};

export const mockLocalChange1: LocalChange = {
    id: 42,
    doc: mockPostDto,
};
export const mockLocalChange2: LocalChange = {
    id: 43,
    doc: mockEnglishContentDto,
};

export const mockGroupPublicContent: Group = {
    _id: "group-public-content",
    type: DocType.Group,
    name: "Public Content",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    acl: [
        {
            type: DocType.Post,
            groupId: "group-public-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Tag,
            groupId: "group-public-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Language,
            groupId: "group-public-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Post,
            groupId: "group-public-editors",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Tag,
            groupId: "group-public-editors",
            permission: [AclPermission.View, AclPermission.Translate, AclPermission.Assign],
        },
        {
            type: DocType.Group,
            groupId: "group-public-editors",
            permission: [AclPermission.View, AclPermission.Assign],
        },
    ],
};
export const mockGroupPublicUsers: Group = {
    _id: "group-public-users",
    type: DocType.Group,
    name: "Public Users",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    acl: [
        {
            type: DocType.Post,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Tag,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Group,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.User,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Language,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
    ],
};
export const mockGroupPublicEditors: Group = {
    _id: "group-public-editors",
    type: DocType.Group,
    name: "Public Editors",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    acl: [
        {
            type: DocType.Post,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Tag,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Group,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.User,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Language,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
    ],
};
export const mockGroupSuperAdmins: Group = {
    _id: "group-super-admins",
    type: DocType.Group,
    name: "Super Admins",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    acl: [
        {
            type: DocType.Post,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Tag,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Group,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.User,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Language,
            groupId: "group-super-admins",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
    ],
};
