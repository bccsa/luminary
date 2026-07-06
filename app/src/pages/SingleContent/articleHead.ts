import { type ContentDto, type LanguageDto } from "luminary-shared";

export function languageCodeForContent(
    languageId: string | undefined,
    languages: Pick<LanguageDto, "_id" | "languageCode">[],
): string {
    return (
        (languageId && languages.find((language) => language._id === languageId)?.languageCode) ||
        (languageId || "").replace(/^lang-/, "") ||
        "en"
    );
}

export function articleJsonLd(c: ContentDto, description: string, inLanguage: string) {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: c.title,
        description,
        author: c.author ? { "@type": "Person", name: c.author } : undefined,
        datePublished: c.publishDate ? new Date(c.publishDate).toISOString() : undefined,
        dateModified: c.updatedTimeUtc ? new Date(c.updatedTimeUtc).toISOString() : undefined,
        inLanguage,
    };
}
