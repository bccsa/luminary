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
    type UserDto,
    type StorageDto,
    type S3CredentialDto,
    StorageType,
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
    parentTagType: TagType.Category,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
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
    availableTranslations: ["lang-eng"],
};

export const mockTopicContentDto: ContentDto = {
    _id: "content-tag-topicA",
    type: DocType.Content,
    parentId: "tag-topicA",
    parentType: DocType.Tag,
    parentTagType: TagType.Topic,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
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
    availableTranslations: ["lang-eng"],
};

export const mockLanguageDtoEng: LanguageDto = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "en",
    name: "English",
    default: 1,
    translations: {
        "menu.home": "Home",
        "menu.explore": "Explore",
        "profile_menu.settings": "Settings",
        "profile_menu.theme": "Theme",
        "profile_menu.language": "Language",
        "profile_menu.bookmarks": "Bookmarks",
        "profile_menu.privacy_policy": "Privacy Policy",
        "profile_menu.login": "Login",
        "profile_menu.logout": "Logout",
        "settings.local_cache.title": "Local cache",
        "settings.local_cache.description":
            "Most data is saved locally on your device. If you experience problems, try deleting all local data. Depending on the amount of available data on the server, it can take some time before all data is available again.",
        "settings.local_cache.button": "Delete local cache",
        "home.title": "Home",
        "explore.title": "Explore",
        "notification.login.title": "You are missing out!",
        "notification.login.message": "Click here to create an account or log in",
        "notification.offline.title": "You are offline.",
        "notification.offline.message":
            "You can still use the app and browse through offline content, but some content (like videos) might not be available.",
        "notification.privacy_policy.title": "Privacy Policy",
        "notification.privacy_policy.message":
            "Click here to accept our privacy policy for a fully featured app experience.",
        "notification.clearCache_offline.title": "Can't clear local cache",
        "notification.clearCache_offline.description":
            "You are offline, new data can't be loaded. Wait until you are online.",
        "notification.clearCache_success.title": "Local cache cleared",
        "notification.clearCache_success.description":
            "New data is loading from the server, it might take a minute.",
        "privacy_policy.modal.title": "Privacy Policy",
        "privacy_policy.modal.message": "By using this app, you agree to our privacy policy.",
        "privacy_policy.modal.button_accept": "Accept",
        "privacy_policy.modal.button_decline": "Decline",
        "privacy_policy.modal.button_close": "Close",
        "privacy_policy.modal.message_map.accepted":
            "You have already accepted the privacy policy.",
        "privacy_policy.modal.message_map.declined":
            "You have previously declined the privacy policy. Please accept it for a fully featured app experience.",
        "privacy_policy.modal.message_map.outdated":
            "We have updated our privacy policy. Please accept it for a fully featured app experience.",
        "privacy_policy.modal.message_map.unaccepted":
            "Please accept our privacy policy for a fully featured app experience.",
        "privacy_policy.banner.message_map.outdated":
            "We have updated our privacy policy. Click here to accept it for a fully featured app experience.",
        "privacy_policy.banner.message_map.unaccepted":
            "Click here to accept our privacy policy for a fully featured app experience.",
        "privacy_policy.banner.title": "Privacy Policy",
        "privacy_policy.modal.link_text": "here",
        "privacy_policy.modal.message_link": "Click {link} to read our privacy policy.",
        "login.bcc.button": "Login in with BCC",
        "login.guest.button": "Login in as guest",
        "select_theme.title": "Select theme",
        "bookmarks.title": "Bookmarks",
        "bookmarks.empty_page":
            "You should try this! Click on this icon on any post to bookmark it.",
    },
};
export const mockLanguageDtoFra: LanguageDto = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "fr",
    name: "Français",
    translations: {
        "menu.home": "Accueil",
        "menu.explore": "Explorer",
        "profile_menu.settings": "Paramètres",
        "profile_menu.theme": "Thème",
        "profile_menu.language": "Langue",
        "profile_menu.bookmarks": "Signets",
        "profile_menu.privacy_policy": "Politique de confidentialité",
        "profile_menu.login": "Connexion",
        "profile_menu.logout": "Déconnexion",
        "settings.local_cache.title": "Cache local",
        "settings.local_cache.description":
            "La plupart des données sont enregistrées localement sur votre appareil. Si vous rencontrez des problèmes, essayez de supprimer toutes les données locales. En fonction de la quantité de données disponibles sur le serveur, cela peut prendre un certain temps avant que toutes les données soient à nouveau disponibles.",
        "settings.local_cache.button": "Supprimer le cache local",
        "home.title": "Accueil",
        "explore.title": "Explorer",
        "notification.login.title": "Vous manquez quelque chose!",
        "notification.login.message": "Cliquez ici pour créer un compte ou vous connecter.",
        "notification.offline.title": "Vous êtes hors ligne.",
        "notification.offline.message":
            "Vous pouvez toujours utiliser l'application et parcourir le contenu hors ligne, mais certains contenus (comme les vidéos) pourraient ne pas être disponibles.",
        "notification.privacy_policy.title": "Politique de confidentialité",
        "notification.privacy_policy.message":
            "Cliquez ici pour accepter notre politique de confidentialité et profiter pleinement de l'application.",
        "notification.clearCache_offline.title": "Impossible de vider le cache local",
        "notification.clearCache_offline.description":
            "Vous êtes hors ligne, les nouvelles données ne peuvent pas être chargées. Veuillez attendre d'être en ligne.",
        "notification.clearCache_success.title": "Cache local vidé",
        "notification.clearCache_success.description":
            "Les nouvelles données sont en cours de chargement depuis le serveur, cela peut prendre une minute.",
        "privacy_policy.modal.title": "Politique de confidentialité",
        "privacy_policy.modal.message":
            "En utilisant cette application, vous acceptez notre politique de confidentialité.",
        "privacy_policy.modal.button_accept": "Accepter",
        "privacy_policy.modal.button_decline": "Refuser",
        "privacy_policy.modal.button_close": "Fermer",
        "privacy_policy.modal.message_map.accepted":
            "Vous avez déjà accepté la politique de confidentialité.",
        "privacy_policy.modal.message_map.declined":
            "Vous avez précédemment refusé la politique de confidentialité. Veuillez l'accepter pour profiter pleinement des fonctionnalités de l'application.",
        "privacy_policy.modal.message_map.outdated":
            "Nous avons mis à jour notre politique de confidentialité. Veuillez l'accepter pour profiter pleinement des fonctionnalités de l'application.",
        "privacy_policy.modal.message_map.unaccepted":
            "Veuillez accepter notre politique de confidentialité pour profiter pleinement des fonctionnalités de l'application.",
        "privacy_policy.banner.message_map.outdated":
            "Nous avons mis à jour notre politique de confidentialité. Cliquez ici pour l'accepter et profiter pleinement des fonctionnalités de l'application.",
        "privacy_policy.banner.message_map.unaccepted":
            "Cliquez ici pour accepter notre politique de confidentialité et profiter pleinement des fonctionnalités de l'application.",
        "privacy_policy.banner.title": "Politique de confidentialité",
        "privacy_policy.modal.link_text": "ici",
        "privacy_policy.modal.message_link":
            "Cliquez {link} pour lire notre politique de confidentialité.",
        "login.bcc.button": "Se connecter avec BCC",
        "login.guest.button": "Se connecter en tant qu'invité",
        "select_theme.title": "Sélectionner un thème",
        "bookmarks.title": "Signets",
        "bookmarks.empty_page":
            "Vous devriez essayer ça ! Cliquez sur cette icône sur n'importe quel post pour l'ajouter aux favoris.",
    },
};

export const mockLanguageDtoSwa: LanguageDto = {
    _id: "lang-swa",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "nb",
    name: "Swahili",
    translations: {
        "menu.home": "Nyumbani",
        "menu.explore": "Chunguza",
        "profile_menu.settings": "Mipangilio",
        "profile_menu.theme": "Mandhari",
        "profile_menu.language": "Lugha",
        "profile_menu.bookmarks": "Vialamisho",
        "profile_menu.privacy_policy": "Sera ya Faragha",
        "profile_menu.login": "Ingia",
        "profile_menu.logout": "Toka",
        "settings.local_cache.title": "Kumbukumbu ya Mitaa",
        "settings.local_cache.description":
            "Takwimu nyingi zimehifadhiwa kwenye kifaa chako. Ikiwa unakutana na matatizo, jaribu kufuta data zote za ndani. Kulingana na kiasi cha data inayopatikana kwenye seva, inaweza kuchukua muda kabla ya data zote kupatikana tena.",
        "settings.local_cache.button": "Futa Kumbukumbu ya Mitaa",
        "pages.home.title": "Nyumbani",
        "pages.explore.title": "Chunguza",
    },
};

export const mockUserDto: UserDto = {
    _id: "user-1",
    type: DocType.User,
    email: "john@doe.com",
    name: "John Doe",
    updatedTimeUtc: 1704114000000,
    lastLogin: 1704114000000,
    memberOf: ["group-super-admins"],
};

export const mockLocalChange1: LocalChangeDto = {
    doc: mockPostDto,
    docId: "post-post1",
};
export const mockLocalChange2: LocalChangeDto = {
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
        {
            type: DocType.Storage,
            groupId: "group-public-editors",
            permission: [AclPermission.View, AclPermission.Edit],
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
        {
            type: DocType.User,
            groupId: "group-public-editors",
            permission: [AclPermission.View, AclPermission.Edit],
        },
        {
            type: DocType.Storage,
            groupId: "group-public-editors",
            permission: [AclPermission.View, AclPermission.Edit],
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
        {
            type: DocType.Storage,
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
                AclPermission.Delete,
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
    "group-super-admins": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            edit: true,
            delete: true,
        },
        storage: {
            view: true,
            edit: true,
            assign: true,
            delete: true,
        },
    },
    "group-private-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            edit: true,
            delete: true,
        },
        storage: {
            view: true,
            edit: true,
            assign: true,
            delete: true,
        },
    },
    "group-public-content": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
        },
        storage: {
            view: true,
            edit: true,
            assign: true,

            delete: true,
        },
    },
    "group-private-editors": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
        },
    },
    "group-public-editors": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
        },
    },
    "group-private-users": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
        },
    },
    "group-public-users": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
        },
    },
    "group-languages": {
        post: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        tag: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            assign: true,
            delete: true,
        },
        language: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        group: {
            view: true,
            create: true,
            edit: true,
            translate: true,
            publish: true,
            delete: true,
        },
        redirect: {
            view: true,
            create: true,
            edit: true,
            delete: true,
            translate: true,
            publish: true,
            assign: true,
        },
        user: {
            view: true,
            create: true,
            edit: true,
            delete: true,
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

export const mockS3Credentials: S3CredentialDto = {
    endpoint: "http://localhost:9000",
    bucketName: "test-bucket",
    accessKey: "testAccessKey123",
    secretKey: "testSecretKey456",
};

export const mockStorageDto: StorageDto = {
    _id: "storage-images",
    type: DocType.Storage,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    name: "Image Storage",
    storageType: StorageType.Image,
    publicUrl: "http://localhost:9000/images",
    credential: mockS3Credentials,
    mimeTypes: ["image/*"],
};

export const mockStorageDtoWithEncryptedCredentials: StorageDto = {
    _id: "storage-media",
    type: DocType.Storage,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    name: "Media Storage",
    storageType: StorageType.Media,
    publicUrl: "http://localhost:9000/media",
    credential_id: "encrypted-cred-123",
    mimeTypes: ["video/*", "audio/*"],
};

export const mockStorageDtoGeneral: StorageDto = {
    _id: "storage-general",
    type: DocType.Storage,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content", "group-super-admins"],
    name: "General Storage",
    storageType: StorageType.Media,
    publicUrl: "http://localhost:9000/general",
    credential: mockS3Credentials,
    mimeTypes: ["image/*", "video/mp4", "application/pdf"],
};

// Alias for backward compatibility
export const mockGroup = mockGroupDtoPublicContent;
export const mockAdminGroup = mockGroupDtoSuperAdmins;
