import { useHead } from "@unhead/vue";
import { computed, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto, type LanguageDto } from "luminary-shared";
import { appLanguageAsRef, appName, cmsLanguages } from "@/globalConfig";
import { useBucketInfo } from "@/composables/useBucketInfo";

const WEB_ORIGIN = (import.meta.env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");

type Alternate = { code: string; slug: string };

type SocialImage = {
    url: string;
    width: number;
    height: number;
};

const staticPageCopy = {
    "/": { title: "home.title", description: "home.description" },
    "/explore": { title: "explore.title", description: "explore.description" },
    "/watch": { title: "watch.title", description: "watch.description" },
} as const;

function href(path: string): string {
    return `${WEB_ORIGIN}${path}`;
}

function staticPath(basePath: string, code: string, defaultCode: string): string {
    if (code === defaultCode) return basePath;
    return basePath === "/" ? `/${code}` : `/${code}${basePath}`;
}

/** Open Graph uses an underscore-delimited locale, unlike HTML's BCP 47 tag. */
function ogLocale(languageCode: string): string {
    try {
        const locale = new Intl.Locale(languageCode).maximize();
        return locale.region ? `${locale.language}_${locale.region}` : locale.language;
    } catch {
        return languageCode.replace(/-/g, "_");
    }
}

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

/**
 * Social crawlers do not support responsive image source sets. Pick the largest
 * original file so the single OG/Twitter URL is suitable for every preview.
 */
function socialImageUrl(
    content: ContentDto | undefined,
    bucketBaseUrl: string | undefined,
): SocialImage | undefined {
    if (!content?.parentImageData?.fileCollections?.length || !bucketBaseUrl) return undefined;

    const files = content.parentImageData.fileCollections.flatMap(
        (collection) => collection.imageFiles,
    );
    if (!files.length) return undefined;

    const image = files.reduce((largest, file) =>
        file.width * file.height > largest.width * largest.height ? file : largest,
    );
    return {
        url: `${bucketBaseUrl.replace(/\/$/, "")}/${image.filename}`,
        width: image.width,
        height: image.height,
    };
}

/** Registers the complete web/SSG head for public static pages. */
export function useLocalizedStaticHead(basePath: "/" | "/explore" | "/watch"): void {
    if (import.meta.env.VITE_BUILD_TARGET !== "web") return;

    const { t } = useI18n();
    const copy = staticPageCopy[basePath];

    useHead(
        computed(() => {
            const langs = cmsLanguages.value.filter((lang) => lang.languageCode);
            const defaultLang = langs.find((lang) => lang.default === 1) ?? langs[0];
            const defaultCode = defaultLang?.languageCode ?? "";
            const currentCode = appLanguageAsRef.value?.languageCode || defaultCode || "en";
            const canonical = href(
                defaultCode ? staticPath(basePath, currentCode, defaultCode) : basePath,
            );

            return {
                title: `${t(copy.title)} - ${appName}`,
                htmlAttrs: { lang: currentCode },
                meta: [
                    { name: "description", content: t(copy.description) },
                    { property: "og:type", content: "website" },
                    { property: "og:site_name", content: appName },
                    { property: "og:locale", content: ogLocale(currentCode) },
                    ...langs
                        .filter((lang) => lang.languageCode !== currentCode)
                        .map((lang) => ({
                            property: "og:locale:alternate",
                            content: ogLocale(lang.languageCode),
                        })),
                ],
                link: [
                    { rel: "canonical", href: canonical },
                    ...langs.map((lang) => ({
                        rel: "alternate",
                        hreflang: lang.languageCode,
                        href: href(staticPath(basePath, lang.languageCode, defaultCode)),
                    })),
                    ...(defaultCode
                        ? [{ rel: "alternate", hreflang: "x-default", href: href(basePath) }]
                        : []),
                ],
            };
        }),
    );
}

/** Registers the complete web/SSG head for an article or the article 404 state. */
export function useContentHead(
    content: Ref<ContentDto | undefined>,
    hreflangAlternates: Ref<Alternate[]>,
): void {
    if (import.meta.env.VITE_BUILD_TARGET !== "web") return;

    const bucketId = computed(() => content.value?.parentImageBucketId);
    const { bucketBaseUrl } = useBucketInfo(bucketId);

    useHead(
        computed(() => {
            const c = content.value;
            const hasDoc = !!c?.slug;
            const title = hasDoc ? `${c!.seoTitle || c!.title} - ${appName}` : appName;
            const description = (hasDoc && (c!.seoString || c!.summary)) || "";
            const url = hasDoc ? href(`/${c!.slug}`) : WEB_ORIGIN || "/";
            const lang = languageCodeForContent(c?.language, cmsLanguages.value);
            const alts = hreflangAlternates.value;
            const xDefault = alts.find((a) => a.code === "en") ?? alts[0];
            const image = socialImageUrl(c, bucketBaseUrl.value);

            return {
                title,
                htmlAttrs: { lang },
                link: [
                    { rel: "canonical", href: url },
                    ...alts.map((a) => ({
                        rel: "alternate",
                        hreflang: a.code,
                        href: href(`/${a.slug}`),
                    })),
                    ...(xDefault
                        ? [
                              {
                                  rel: "alternate",
                                  hreflang: "x-default",
                                  href: href(`/${xDefault.slug}`),
                              },
                          ]
                        : []),
                ],
                meta: [
                    { name: "description", content: description },
                    { property: "og:type", content: "article" },
                    { property: "og:site_name", content: appName },
                    { property: "og:locale", content: ogLocale(lang) },
                    ...alts
                        .filter((alternate) => alternate.code !== lang)
                        .map((alternate) => ({
                            property: "og:locale:alternate",
                            content: ogLocale(alternate.code),
                        })),
                    { property: "og:title", content: c?.seoTitle || c?.title || appName },
                    { property: "og:description", content: description },
                    { property: "og:url", content: url },
                    ...(image
                        ? [
                              { property: "og:image", content: image.url },
                              { property: "og:image:width", content: String(image.width) },
                              { property: "og:image:height", content: String(image.height) },
                              { name: "twitter:image", content: image.url },
                          ]
                        : []),
                    { name: "twitter:card", content: "summary_large_image" },
                    { name: "twitter:title", content: c?.seoTitle || c?.title || appName },
                    { name: "twitter:description", content: description },
                    { name: "robots", content: hasDoc ? "index,follow" : "noindex,follow" },
                ],
                script: hasDoc
                    ? [
                          {
                              type: "application/ld+json",
                              textContent: JSON.stringify(articleJsonLd(c!, description, lang)),
                          },
                      ]
                    : [],
            };
        }),
    );
}
