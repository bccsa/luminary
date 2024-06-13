import {
    DocType,
    type ContentDto,
    type PostDto,
    type Content,
    ContentStatus,
    type Post,
    type Language,
    type LocalChangeDto,
    type LanguageDto,
    TagType,
    type Tag,
    type TagDto,
    type Group,
    AclPermission,
    type ImageDto,
} from "@/types";
import { DateTime } from "luxon";

export const mockCategoryDto: TagDto = {
    _id: "tag-category1",
    type: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    tagType: TagType.Category,
    pinned: false,
    image: "test-image.jpg",
    tags: [],
};

export const mockPostDto: PostDto = {
    _id: "post-post1",
    type: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    image: "test-image.jpg",
    tags: ["tag-category1"],
};

export const mockEnglishContentDto: ContentDto = {
    _id: "content-post1-eng",
    type: DocType.Content,
    parentId: "post-post1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    language: "lang-eng",
    status: "published",
    slug: "post1-eng",
    title: "Post 1",
    summary: "This is an example post",
    author: "ChatGPT",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily\'s eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community\'s beloved guardian"}]}]}',
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
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    language: "lang-fra",
    status: "published",
    slug: "post1-fra",
    title: "Post 1",
    summary: "Ceci est un exemple de publication.",
    author: "ChatGPT",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l\'aider. Lily s\'accrocha à l\'espoir alors qu\'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté."}]}]}',
    localisedImage: "",
    audio: "",
    video: "",
    publishDate: 1704114000000,
    expiryDate: undefined,
};
export const mockSwahiliContentDto: ContentDto = {
    _id: "content-post1-swa",
    type: DocType.Content,
    parentId: "post-post1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    language: "lang-swa",
    status: "published",
    slug: "post1-swa",
    title: "Post 1",
    summary: "Hii ni chapisho la mfano.",
    author: "ChatGPT",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l\'aider. Lily s\'accrocha à l\'espoir alors qu\'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté."}]}]}',
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
    parentType: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    language: "lang-eng",
    status: ContentStatus.Published,
    slug: "content-tag-category1",
    title: "Category 1",
    summary: "Example tag",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A category"}]}]}',
    publishDate: 1704114000000,
};

export const mockLanguageEng: Language = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-languages"],
    languageCode: "eng",
    name: "English",
};
export const mockLanguageFra: Language = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-languages"],
    languageCode: "fra",
    name: "Français",
};
export const mockLanguageSwa: Language = {
    _id: "lang-swa",
    type: DocType.Language,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-languages"],
    languageCode: "swa",
    name: "Swahili",
};

export const mockLanguageDtoEng: LanguageDto = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "eng",
    name: "English",
};
export const mockLanguageDtoFra: LanguageDto = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "fra",
    name: "Français",
};

export const mockLanguageDtoSwa: LanguageDto = {
    _id: "lang-swa",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "swa",
    name: "Swahili",
};

export const mockEnglishContent: Content = {
    _id: "content-post1-eng",
    parentId: "post-post1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-private-content"],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "post1-eng",
    title: "English translation title",
    summary: "This is an example post",
    author: "ChatGPT",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily\'s eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community\'s beloved guardian"}]}]}',
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
    memberOf: ["group-private-content"],
    language: mockLanguageFra,
    status: ContentStatus.Draft,
    slug: "post1-fra",
    title: "French translation title",
    summary: "Ceci est un exemple de publication.",
    author: "ChatGPT",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l\'aider. Lily s\'accrocha à l\'espoir alors qu\'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté."}]}]}',
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
    memberOf: ["group-private-content"],
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
    memberOf: ["group-public-content"],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-category1",
    title: "Category 1",
    summary: "Example tag",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A category"}]}]}',
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockFrenchCategoryContent: Content = {
    _id: "content-tag-category1-fra",
    parentId: "tag-category1",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-public-content"],
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
    memberOf: ["group-private-content"],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-topicA",
    title: "Topic A",
    summary: "Another example tag",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A topic"}]}]}',
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockAudioPlaylistContent: Content = {
    _id: "content-tag-audioPlaylist-Faith",
    parentId: "tag-audioPlaylist-Faith",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-private-content"],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "content-tag-audioPlaylist-Faith",
    title: "Faith",
    summary: "A playlist about faith",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An audio playlist"}]}]}',
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
};
export const mockCategory: Tag = {
    _id: "tag-category1",
    type: DocType.Tag,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: ["group-public-content"],
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
    memberOf: ["group-private-content"],
    content: [mockEnglishContent, mockFrenchContent],
    tags: [mockCategory],
};

export const mockImage: ImageDto = {
    _id: "image-image1",
    type: DocType.Image,
    name: "Image 1",
    description: "An image",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }).toMillis(),
    memberOf: ["group-private-content"],
    fileCollections: [
        {
            aspectRatio: 1.5,
            imageFiles: [
                {
                    width: 180,
                    height: 120,
                    filename: "test-image.webp",
                },
            ],
        },
    ],
};

export const mockLocalChange1: LocalChangeDto = {
    id: 42,
    doc: mockPostDto,
    docId: "post-post1",
};
export const mockLocalChange2: LocalChangeDto = {
    id: 43,
    doc: mockEnglishContentDto,
    docId: "content-post1-eng",
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

export const fullAccessToAllContentMap = {
    "group-private-content": {
        post: { view: true, create: true, edit: true, translate: true, publish: true },
        tag: { view: true, create: true, edit: true, translate: true, publish: true },
        language: { view: true, create: true, edit: true, translate: true, publish: true },
    },
    "group-public-content": {
        post: { view: true, create: true, edit: true, translate: true, publish: true },
        tag: { view: true, create: true, edit: true, translate: true, publish: true },
        language: { view: true, create: true, edit: true, translate: true, publish: true },
    },
    "group-languages": {
        post: { view: true, create: true, edit: true, translate: true, publish: true },
        tag: { view: true, create: true, edit: true, translate: true, publish: true },
        language: { view: true, create: true, edit: true, translate: true, publish: true },
    },
};

export const viewAccessToAllContentMap = {
    "group-private-content": {
        post: { view: true, create: false, edit: false, translate: false, publish: false },
        tag: { view: true, create: false, edit: false, translate: false, publish: false },
        language: { view: true, create: false, edit: false, translate: false, publish: false },
    },
    "group-public-content": {
        post: { view: true, create: false, edit: false, translate: false, publish: false },
        tag: { view: true, create: false, edit: false, translate: false, publish: false },
        language: { view: true, create: false, edit: false, translate: false, publish: false },
    },
    "group-languages": {
        post: { view: true, create: false, edit: false, translate: false, publish: false },
        tag: { view: true, create: false, edit: false, translate: false, publish: false },
        language: { view: true, create: false, edit: false, translate: false, publish: false },
    },
};

export const translateAccessToAllContent = {
    "group-private-content": {
        post: { view: true, translate: true },
        tag: { view: true, translate: true },
        language: { view: true, translate: true },
    },
    "group-public-content": {
        post: { view: true, translate: true },
        tag: { view: true, translate: true },
        language: { view: true, translate: true },
    },
    "group-languages": {
        post: { view: true, translate: true },
        tag: { view: true, translate: true },
        language: { view: true, translate: true },
    },
};
