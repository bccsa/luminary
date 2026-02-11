import {
    DocType,
    type ContentDto,
    type PostDto,
    type LocalChangeDto,
    type LanguageDto,
    type TagDto,
    // AclPermission,
    type ImageDto,
    // GroupDto,
    TagType,
    PublishStatus,
    PostType,
    type RedirectDto,
    RedirectType,
    MediaType,
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
    parentPublishDateVisible: true,
    seoTitle: "Test Seo Title",
    seoString: "Test seo summary",
    availableTranslations: ["lang-eng", "lang-fra"],
    parentMedia: {
        hlsUrl: "https://example.com/video.m3u8",
        fileCollections: [
            {
                languageId: "lang-eng",
                fileUrl: "https://example.com/audio.mp3",
                bitrate: 128000,
                mediaType: MediaType.Audio,
            },
        ],
    },
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
    parentPublishDateVisible: true,
    availableTranslations: ["lang-eng", "lang-fra"],
    parentMedia: {
        hlsUrl: "",
        fileCollections: [
            {
                languageId: "lang-fra",
                fileUrl: "https://example.com/audio-fr.mp3",
                bitrate: 128000,
                mediaType: MediaType.Audio,
            },
        ],
    },
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
    parentPublishDateVisible: true,
    parentMedia: {
        hlsUrl: "",
        fileCollections: [
            {
                languageId: "lang-swa",
                fileUrl: "https://example.com/audio-swa.mp3",
                bitrate: 128000,
                mediaType: MediaType.Audio,
            },
        ],
    },
};
export const mockCategoryContentDto: ContentDto = {
    _id: "content-tag-category1",
    type: DocType.Content,
    parentId: "tag-category1",
    parentType: DocType.Tag,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    parentTags: [],
    parentTaggedDocs: ["post-post1"],
    parentTagType: TagType.Category,
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
    parentPublishDateVisible: true,
    availableTranslations: ["lang-eng", "lang-fra"],
};

export const mockTopicContentDto: ContentDto = {
    _id: "content-tag-topicA",
    type: DocType.Content,
    parentId: "tag-topicA",
    parentType: DocType.Tag,
    parentTagType: TagType.Topic,
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
    parentPublishDateVisible: true,
    availableTranslations: ["lang-eng", "lang-fra"],
};

export const mockLanguageDtoEng: LanguageDto = {
    _id: "lang-eng",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "eng",
    name: "English",
    default: 1,
    translations: {
        "topic.search_placeholder": "Search",
        "topic.no_results_found": "No results found for",
        "menu.home": "Home",
        "menu.explore": "Explore",
        "profile_menu.settings": "Settings",
        "profile_menu.theme": "Theme",
        "profile_menu.language": "Language",
        "profile_menu.bookmarks": "Bookmarks",
        "profile_menu.privacy_policy": "Privacy Policy",
        "profile_menu.login": "Login",
        "profile_menu.login.offline_notification":
            "Oops! We could not log you in. Please connect to the internet before logging in.",
        "profile_menu.login.offline_notification_title": "Offline",
        "profile_menu.logout": "Logout",
        "profile_menu.logout.offline_notification":
            "Oops! We could not log you out. Please connect to the internet before logging out.",
        "profile_menu.logout.offline_notification_title": "Offline",
        "settings.local_cache.title": "Local cache",
        "settings.local_cache.description":
            "Most data is saved locally on your device. If you experience problems, try deleting all local data. Depending on the amount of available data on the server, it can take some time before all data is available again.",
        "settings.local_cache.button": "Delete local cache",
        "home.title": "Home",
        "explore.title": "Explore",
        "home.newest": "Newest",
        "content.related_title": "Related",
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
        "notification.content_not_available.title": "Unpublished transation",
        "notification.content_not_available.description":
            "The {language} translation for this content is not yet available.",
        "notification.translation_available.title": "Translation available",
        "notification.translation_available.description":
            "The content is also available in English. Click here to view it.",
        "privacy_policy.modal.title": "Privacy Policy",
        "privacy_policy.modal.message": "By using this app, you agree to our privacy policy.",
        "privacy_policy.modal.button_accept": "Accept",
        "privacy_policy.modal.button_decline": "Decline",
        "privacy_policy.modal.button_close": "Close",
        "privacy_policy.modal.message_map.accepted": "You have already accepted the privacy policy",
        "privacy_policy.modal.message_map.declined":
            "You have previously declined the privacy policy. Please accept it for a fully featured app experience",
        "privacy_policy.modal.message_map.outdated":
            "We have updated our privacy policy. Please accept it for a fully featured app experience",
        "privacy_policy.modal.message_map.unaccepted":
            "Please accept our privacy policy for a fully featured app experience",
        "privacy_policy.banner.message_map.outdated":
            "We have updated our privacy policy. Click here to accept it for a fully featured app experience",
        "privacy_policy.banner.message_map.unaccepted":
            "Click here to accept our privacy policy for a fully featured app experience",
        "privacy_policy.banner.title": "Privacy Policy",
        "privacy_policy.modal.link_text": "here",
        "privacy_policy.modal.message_link": "Click {link} to read our privacy policy",
        "login.bcc.button": "Login in with BCC",
        "login.guest.button": "Login in as guest",
        "select_theme.title": "Select theme",
        "select_theme.light": "Light",
        "select_theme.dark": "Dark",
        "select_theme.system": "System",
        "select_theme.close_button": "Close",
        "bookmarks.title": "Bookmarks",
        "bookmarks.empty_page":
            "You should try this! Click on this icon on any post to bookmark it.",
        "bookmarks.notification.title": "Bookmark added",
        "bookmarks.notification.description":
            "This content has been added to your bookmarks. You can find the bookmarks page from the profile menu.",
    },
};
export const mockLanguageDtoFra: LanguageDto = {
    _id: "lang-fra",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "fra",
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
        "notification.content_not_available.description":
            "La traduction en Français de ce contenu n'est pas encore disponible.",
        "notification.translation_available.title": "Traduction disponible",
    },
    default: 0,
};

export const mockLanguageDtoSwa: LanguageDto = {
    _id: "lang-swa",
    type: DocType.Language,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-languages"],
    languageCode: "swa",
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
        "home.title": "Nyumbani",
        "explore.title": "Chunguza",
    },
    default: 0,
};

export const mockRedirectDto: RedirectDto = {
    _id: "redirect-o",
    memberOf: ["group-public-content"],
    type: DocType.Redirect,
    updatedTimeUtc: 0,
    redirectType: RedirectType.Temporary,
    slug: "vod",
    toSlug: "page1-eng",
};

export const mockImageDto: ImageDto = {
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
    id: 1,
    doc: mockPostDto,
    docId: "post-post1",
};
export const mockLocalChange2: LocalChangeDto = {
    id: 2,
    doc: mockEnglishContentDto,
    docId: "content-post1-eng",
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
};
