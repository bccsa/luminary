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
    seoTitle: "Test Seo Title",
    seoString: "Test seo summary",
    availableTranslations: ["lang-eng", "lang-fra"],
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
    availableTranslations: ["lang-eng", "lang-fra"],
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
        "menu.watch": "Watch",
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
        "settings.device_info.title": "Device info",
        "settings.device_info.description": "Provide these details when contacting support",
        "home.title": "Home",
        "home.continue": "Continue Watching",
        "explore.title": "Explore",
        "explore.other": "Other",
        "watch.title": "Watch",
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
            "The content is also available in {language}. Click here to view it.",
        "privacy_policy.modal.title": "Privacy Policy",
        "privacy_policy.modal.message": "By using this app, you agree to our privacy policy.",
        "privacy_policy.modal.button_accept": "Accept",
        "privacy_policy.modal.button_decline": "Decline",
        "privacy_policy.modal.button_logOut": "Log out",
        "privacy_policy.modal.button_necessaryOnly": "Necessary only",
        "privacy_policy.modal.button_readMore": "Read more",
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
        "privacy_policy.modal.link_text_1": "Click",
        "privacy_policy.modal.link_text_2": "here",
        "privacy_policy.modal.link_text_3": "to read our privacy policy",
        "login.bcc.button": "Login in with BCC",
        "login.guest.button": "Login in as guest",
        "select_theme.title": "Select theme",
        "select_theme.light": "Light",
        "select_theme.dark": "Dark",
        "select_theme.system": "System",
        "select_theme.close_button": "Close",
        "title.home": "Home",
        "title.explore": "Explore",
        "title.bookmarks": "Bookmarks",
        "title.settings": "Settings",
        "bookmarks.title": "Bookmarks",
        "bookmarks.empty_page":
            "You should try this! Click on this icon on any post to bookmark it.",
        "bookmarks.notification.title": "Bookmark added",
        "bookmarks.notification.description":
            "This content has been added to your bookmarks. You can find the bookmarks page from the profile menu.",
        "language.modal.title": "Select Language",
        "language.modal.close": "Close",
        "logout.modal.title": "Logout",
        "logout.modal.description": "Are you sure you want to log out?",
        "logout.modal.button_cancel": "Cancel",
        "logout.modal.button_logout": "Logout",
        "notfoundpage.navigation.home": "Back to home",
        "notfoundpage.unauthenticated.title": "Oops! You are not logged in.",
        "notfoundpage.unauthenticated.loginPrompt.before": "Please click",
        "notfoundpage.unauthenticated.loginPrompt.linkText": "here",
        "notfoundpage.unauthenticated.loginPrompt.after": "to log in or create an account.",
        "notfoundpage.unauthenticated.description":
            "The content may only be available to logged in users.",
        "notfoundpage.authenticated.title": "Hey - we could not find this page",
        "notfoundpage.authenticated.description":
            "The content you are looking for may have been removed or is not available at the moment.",
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
        "topic.search_placeholder": "Rechercher",
        "topic.no_results_found": "Aucun resultat pour",
        "menu.home": "Accueil",
        "menu.explore": "Explore",
        "menu.watch": "Regarde",
        "profile_menu.settings": "Paramètres",
        "profile_menu.theme": "Thème",
        "profile_menu.language": "Langue",
        "profile_menu.bookmarks": "Signets",
        "profile_menu.privacy_policy": "Politique de confidentialité",
        "profile_menu.login": "Connexion",
        "profile_menu.login.offline_notification":
            "Oups ! Nous n'avons pas pu vous connecter. Veuillez vous connecter à Internet avant de vous connecter.",
        "profile_menu.login.offline_notification_title": "Déconnecté",
        "profile_menu.logout": "Déconnexion",
        "profile_menu.logout.offline_notification":
            "Oups ! Nous n'avons pas pu vous déconnecter. Veuillez vous connecter à Internet avant de vous déconnecter.",
        "profile_menu.logout.offline_notification_title": "Déconnecté",
        "settings.local_cache.title": "Cache local",
        "settings.local_cache.description":
            "La plupart des données sont enregistrées localement sur votre appareil. Si vous rencontrez des problèmes, essayez de supprimer toutes les données locales. En fonction de la quantité de données disponibles sur le serveur, cela peut prendre un certain temps avant que toutes les données soient à nouveau disponibles.",
        "settings.local_cache.button": "Supprimer le cache local",
        "settings.device_info.title": "Informations sur l'appareil",
        "settings.device_info.description":
            "Fournissez ces détails lors de la prise de contact avec le support",
        "home.title": "Accueil",
        "home.continue": "Continuer à regarder",
        "explore.title": "Explore",
        "explore.other": "Autre",
        "watch.title": "Regarde",
        "home.newest": "Nouveaux",
        "content.related_title": "Contenus similaires",
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
        "notification.content_not_available.title": "Traduction non disponible",
        "notification.content_not_available.description":
            "La traduction en {language} de ce contenu n'est pas encore disponible.",
        "notification.translation_available.title": "Traduction disponible",
        "notification.translation_available.description":
            "Le contenu est également disponible en {language}. Cliquez ici pour le voir.",
        "privacy_policy.modal.title": "Politique de confidentialité",
        "privacy_policy.modal.message":
            "En utilisant cette application, vous acceptez notre politique de confidentialité.",
        "privacy_policy.modal.button_accept": "Accepter",
        "privacy_policy.modal.button_decline": "Refuser",
        "privacy_policy.modal.button_logOut": "Déconnexion",
        "privacy_policy.modal.button_necessaryOnly": "Seulement le nécessaire",
        "privacy_policy.modal.button_readMore": "Lire plus",
        "privacy_policy.modal.button_close": "Fermer",
        "privacy_policy.modal.message_map.accepted":
            "Vous avez déjà accepté la politique de confidentialité",
        "privacy_policy.modal.message_map.declined":
            "Vous avez précédemment refusé la politique de confidentialité. Veuillez l'accepter pour profiter pleinement des fonctionnalités de l'application",
        "privacy_policy.modal.message_map.outdated":
            "Nous avons mis à jour notre politique de confidentialité. Veuillez l'accepter pour profiter pleinement des fonctionnalités de l'application",
        "privacy_policy.modal.message_map.unaccepted":
            "Veuillez accepter notre politique de confidentialité pour profiter pleinement des fonctionnalités de l'application",
        "privacy_policy.banner.message_map.outdated":
            "Nous avons mis à jour notre politique de confidentialité. Cliquez ici pour l'accepter et profiter pleinement des fonctionnalités de l'application",
        "privacy_policy.banner.message_map.unaccepted":
            "Cliquez ici pour accepter notre politique de confidentialité et profiter pleinement des fonctionnalités de l'application",
        "privacy_policy.banner.title": "Politique de confidentialité",
        "privacy_policy.modal.link_text_1": "Cliquez",
        "privacy_policy.modal.link_text_2": "ici",
        "privacy_policy.modal.link_text_3": "pour lire notre politique de confidentialité",
        "login.bcc.button": "Se connecter avec BCC",
        "login.guest.button": "Se connecter en tant qu'invité",
        "select_theme.title": "Sélectionner un thème",
        "select_theme.light": "Clair",
        "select_theme.dark": "Sombre",
        "select_theme.system": "Système",
        "select_theme.close_button": "Fermer",
        "title.home": "Accueil",
        "title.explore": "Explore",
        "title.bookmarks": "Signets",
        "title.settings": "Paramètres",
        "bookmarks.title": "Signets",
        "bookmarks.empty_page":
            "Vous devriez essayer ça ! Cliquez sur cette icône sur n'importe quel post pour l'ajouter aux favoris.",
        "bookmarks.notification.title": "Signet ajouté",
        "bookmarks.notification.description":
            "Ce contenu a été ajouté aux signets. Vous pouvez trouver la page des signets dans le menu du profil.",
        "language.modal.title": "Sélectionner la langue",
        "language.modal.close": "Fermer",
        "logout.modal.title": "Déconnexion",
        "logout.modal.description": "Êtes-vous sûr de vouloir vous déconnecter ?",
        "logout.modal.button_cancel": "Annuler",
        "logout.modal.button_logout": "Déconnexion",
        "notfoundpage.navigation.home": "Retour à la maison",
        "notfoundpage.unauthenticated.title": "Oups ! Vous n'êtes pas connecté.",
        "notfoundpage.unauthenticated.loginPrompt.before": "Veuillez cliquer",
        "notfoundpage.unauthenticated.loginPrompt.linkText": "ici",
        "notfoundpage.unauthenticated.loginPrompt.after": "pour vous connecter ou créer un compte.",
        "notfoundpage.unauthenticated.description":
            "Le contenu peut être uniquement disponible pour les utilisateurs connectés.",
        "notfoundpage.authenticated.title": "Hé, nous n'avons pas pu trouver cette page",
        "notfoundpage.authenticated.description":
            "Le contenu que vous recherchez a peut-être été supprimé ou n'est pas disponible pour le moment.",
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
    id: 42,
    doc: mockPostDto,
    docId: "post-post1",
};
export const mockLocalChange2: LocalChangeDto = {
    id: 43,
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
