/**
 * Public web identity. Keep every public URL in one place so canonical links,
 * social cards and structured data cannot disagree about the site identity.
 */
const origin = (import.meta.env.VITE_WEB_ORIGIN || "").replace(/\/$/, "");
const organizationName =
    import.meta.env.VITE_PUBLIC_ORGANIZATION_NAME || import.meta.env.VITE_APP_NAME || "Luminary";
const logoPath = import.meta.env.VITE_PUBLIC_LOGO_PATH || "/logo.svg";

export const publicSite = {
    origin,
    organizationName,
};

/** Returns an absolute production URL only when the public origin is configured. */
export function publicUrl(path: string): string | undefined {
    if (!origin) return undefined;
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path.startsWith("/") ? path : `/${path}`, `${origin}/`).toString();
}

/** Suitable for canonical/link tags, which may retain a relative URL in local development. */
export function canonicalUrl(path: string): string {
    return publicUrl(path) ?? path;
}

export function publisherJsonLd() {
    const url = publicUrl("/");
    const logo = publicUrl(logoPath);
    if (!url || !logo) return undefined;

    return {
        "@type": "Organization",
        name: organizationName,
        url,
        logo: { "@type": "ImageObject", url: logo },
    };
}

export function websiteJsonLd() {
    const url = publicUrl("/");
    if (!url) return undefined;

    // `q` is intentionally limited to the anonymous, public FTS overlay on
    // /explore. Values are encoded with URLSearchParams / encodeURIComponent.
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: organizationName,
        url,
        potentialAction: {
            "@type": "SearchAction",
            target: `${canonicalUrl("/explore")}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
        },
    };
}
