import {
    DocType,
    type ContentDto,
    type PostDto,
    type LocalChangeDto,
    type LanguageDto,
    type TagDto,
    AclPermission,
    type ImageDto,
    type GroupDto,
    TagType,
    PublishStatus,
    PostType,
    type RedirectDto,
    RedirectType,
    type AccessMap,
} from "luminary-shared";

export const mockCategoryDto: TagDto = {
    _id: "tag-category1",
    type: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    tagType: TagType.Category,
    pinned: 0,
    imageData: {
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
    } as ImageDto,
    tags: [],
    publishDateVisible: false,
};

export const mockTopicDto: TagDto = {
    _id: "tag-topicA",
    type: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    tagType: TagType.Topic,
    pinned: 0,
    imageData: {
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
    } as ImageDto,
    tags: [],
    publishDateVisible: false,
};

export const mockPostDto: PostDto = {
    _id: "post-post1",
    type: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    imageData: {
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
    } as ImageDto,
    tags: ["tag-category1"],
    publishDateVisible: true,
    postType: PostType.Blog,
};

export const mockEnglishContentDto: ContentDto = {
    _id: "content-post1-eng",
    type: DocType.Content,
    parentId: "post-post1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-category1"],
    language: "lang-eng",
    status: PublishStatus.Published,
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
    parentImageData: {
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
    } as ImageDto,
    parentPublishDateVisible: true,
    parentPostType: PostType.Blog,
};
export const mockFrenchContentDto: ContentDto = {
    _id: "content-post1-fra",
    type: DocType.Content,
    parentId: "post-post1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-category1"],
    language: "lang-fra",
    status: PublishStatus.Published,
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
    parentImageData: {
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
    } as ImageDto,
    parentPublishDateVisible: true,
    parentPostType: PostType.Blog,
};
export const mockSwahiliContentDto: ContentDto = {
    _id: "content-post1-swa",
    type: DocType.Content,
    parentId: "post-post1",
    parentType: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    parentTags: ["tag-category1"],
    language: "lang-swa",
    status: PublishStatus.Published,
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
    parentImageData: {
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
    } as ImageDto,
    parentPublishDateVisible: true,
    parentPostType: PostType.Blog,
};
export const mockCategoryContentDto: ContentDto = {
    _id: "content-tag-category1",
    type: DocType.Content,
    parentId: "tag-category1",
    parentType: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "content-tag-category1",
    title: "Category 1",
    summary: "Example tag",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A category"}]}]}',
    publishDate: 1704114000000,
    parentImageData: {
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
    } as ImageDto,
    parentPublishDateVisible: false,
};

export const mockTopicContentDto: ContentDto = {
    _id: "content-tag-topicA",
    type: DocType.Content,
    parentId: "tag-topicA",
    parentType: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    parentTags: [],
    language: "lang-eng",
    status: PublishStatus.Published,
    slug: "content-tag-topicA",
    title: "Topic A",
    summary: "Example tag",
    text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A category"}]}]}',
    publishDate: 1704114000000,
    parentImageData: {
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
    } as ImageDto,
    parentPublishDateVisible: false,
};

export const mockLanguageDtoEng: LanguageDto = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "eng",
    default: 0,
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

export const mockRedirectDto: RedirectDto = {
    _id: "redirect-o",
    memberOf: ["group-public-content"],
    type: DocType.Redirect,
    updatedTimeUtc: 0,
    redirectType: RedirectType.Temporary,
    slug: "vod",
    toSlug: "live",
};

export const mockGroupDtoPrivateContent: GroupDto = {
    _id: "group-private-content",
    type: DocType.Group,
    name: "Private Content",
    updatedTimeUtc: 1,
    acl: [
        {
            type: DocType.Post,
            groupId: "group-private-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Tag,
            groupId: "group-private-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Language,
            groupId: "group-private-users",
            permission: [AclPermission.View],
        },
        {
            type: DocType.Post,
            groupId: "group-private-editors",
            permission: [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Translate,
                AclPermission.Publish,
            ],
        },
        {
            type: DocType.Tag,
            groupId: "group-private-editors",
            permission: [AclPermission.View, AclPermission.Translate, AclPermission.Assign],
        },
        {
            type: DocType.Group,
            groupId: "group-private-editors",
            permission: [AclPermission.View, AclPermission.Assign],
        },
    ],
};

export const mockGroupDtoPublicContent: GroupDto = {
    _id: "group-public-content",
    type: DocType.Group,
    name: "Public Content",
    updatedTimeUtc: 1,
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
export const mockGroupDtoPublicUsers: GroupDto = {
    _id: "group-public-users",
    type: DocType.Group,
    name: "Public Users",
    updatedTimeUtc: 1,
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
export const mockGroupDtoPublicEditors: GroupDto = {
    _id: "group-public-editors",
    type: DocType.Group,
    name: "Public Editors",
    updatedTimeUtc: 1,
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
export const mockGroupDtoSuperAdmins: GroupDto = {
    _id: "group-super-admins",
    type: DocType.Group,
    name: "Super Admins",
    updatedTimeUtc: 1,
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

export const superAdminAccessMap = {
    "group-private-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-public-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-private-editors": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-public-editors": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-private-users": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-public-users": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
    },
    "group-languages": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
    },
};

export const fullAccessToAllContentMap = {
    "group-private-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
    },
    "group-public-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
    },
    "group-languages": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
        },
    },
};

export const viewAccessToAllContentMap = {
    "group-private-content": {
        post: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        tag: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        language: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
    },
    "group-public-content": {
        post: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        tag: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        language: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
    },
    "group-languages": {
        post: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        tag: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
        language: {
            view: true,
            create: false,
            edit: false,
            translate: false,
            publish: false,
        },
    },
};

export const translateAccessToAllContentMap = {
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
} as AccessMap;
