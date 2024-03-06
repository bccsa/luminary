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
} from "@/types";
import { DateTime } from "luxon";

export const mockPostDto: PostDto = {
    _id: "post-post1",
    type: DocType.Post,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    image: "",
    tags: ["tag-category1", "tag-topicA"],
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
    text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
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
    text: "Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l'aider. Lily s'accrocha à l'espoir alors qu'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté.",
    localisedImage: "",
    audio: "",
    video: "",
    publishDate: 1704114000000,
    expiryDate: undefined,
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
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageEng,
    status: ContentStatus.Published,
    slug: "post1-eng",
    title: "English translation title",
    summary: "This is an example post",
    author: "ChatGPT",
    text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    expiryDate: undefined,
};
export const mockFrenchContent: Content = {
    _id: "content-post1-fra",
    type: DocType.Content,
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    language: mockLanguageFra,
    status: ContentStatus.Draft,
    slug: "post1-fra",
    title: "Post 1",
    summary: "Ceci est un exemple de publication.",
    author: "ChatGPT",
    text: "Dans la paisible ville de Willowdale, la petite Lily pleurait la disparition de son cher chat, Whiskers. Cherchant frénétiquement dans le quartier, elle tomba sur le pompier Jake, réputé pour son cœur généreux. Avec un sourire rassurant, il promit de l'aider. Lily s'accrocha à l'espoir alors qu'ils parcouraient les rues ensemble. Sous un porche poussiéreux, ils trouvèrent Whiskers, effrayé mais sain et sauf. Des larmes de gratitude remplirent les yeux de Lily lorsque le pompier Jake lui remit le félin sauvé. Leur petite ville résonna de joie tandis que Lily serrait son ami à fourrure dans ses bras, et dès ce jour, le pompier Jake devint un héros dans son cœur et le gardien bien-aimé de la communauté.",
    localisedImage: undefined,
    audio: undefined,
    video: undefined,
    publishDate: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    expiryDate: undefined,
};

export const mockUnpublishableContent: Content = {
    _id: "content-post1-eng",
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

export const mockPost: Post = {
    type: DocType.Post,
    _id: "post-post1",
    image: "test.jpg",
    updatedTimeUtc: DateTime.fromObject({ year: 2024, month: 1, day: 1 }),
    memberOf: [],
    content: [mockEnglishContent, mockFrenchContent],
    tags: [],
};

export const mockLocalChange1: LocalChange = {
    id: 42,
    doc: mockPostDto,
};
export const mockLocalChange2: LocalChange = {
    id: 43,
    doc: mockEnglishContentDto,
};
