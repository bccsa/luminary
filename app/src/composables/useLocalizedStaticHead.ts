import { computed } from "vue";
import { useHead } from "@unhead/vue";
import { appLanguageAsRef, cmsLanguages } from "@/globalConfig";

const WEB_ORIGIN = (import.meta.env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");

function staticPath(basePath: string, code: string, defaultCode: string): string {
    if (code === defaultCode) return basePath;
    return basePath === "/" ? `/${code}` : `/${code}${basePath}`;
}

function href(path: string): string {
    return `${WEB_ORIGIN}${path}`;
}

export function useLocalizedStaticHead(basePath: "/" | "/explore" | "/watch"): void {
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
                htmlAttrs: { lang: currentCode },
                link: [
                    { rel: "canonical", href: canonical },
                    ...langs.map((lang) => ({
                        rel: "alternate",
                        hreflang: lang.languageCode,
                        href: href(staticPath(basePath, lang.languageCode, defaultCode)),
                    })),
                    ...(defaultCode
                        ? [
                              {
                                  rel: "alternate",
                                  hreflang: "x-default",
                                  href: href(staticPath(basePath, defaultCode, defaultCode)),
                              },
                          ]
                        : []),
                ],
            };
        }),
    );
}
