import { RedirectType } from "luminary-shared";

/**
 * Static meta-refresh redirect renderer, shared by the full build and the ISR
 * watcher so both emit identical files. `<meta refresh>` works with JS off;
 * `location.replace` keeps the hop out of history. The serving layer applies the
 * real 301/302 from the `x-redirect-status` meta tag or the `ssg-redirect-index.json`
 * sidecar.
 */

/** Maps a redirect's `redirectType` to the HTTP status the serving layer should use. */
export function redirectStatus(redirectType: RedirectType): 301 | 302 {
    return redirectType === RedirectType.Permanent ? 301 : 302;
}

function cleanSlug(slug: string): string {
    return slug.replace(/^\/+/, "");
}

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** `toSlug` is untrusted CMS input — the attribute and inline-script target are escaped independently. */
export function redirectHtml(toSlug: string, redirectType: RedirectType): string {
    const target = `/${cleanSlug(toSlug)}`;
    const escaped = escapeAttr(target);
    const jsTarget = JSON.stringify(target).replace(/</g, "\\u003c");
    const status = redirectStatus(redirectType);
    // Permanent: pass ranking signals on to the new URL. Temporary: the old URL
    // stays canonical, so tell crawlers not to index this transient stub instead.
    const seoTag =
        redirectType === RedirectType.Permanent
            ? `<link rel="canonical" href="${escaped}">`
            : '<meta name="robots" content="noindex">';

    return (
        "<!doctype html><html><head>" +
        '<meta charset="utf-8">' +
        `<meta name="x-redirect-status" content="${status}">` +
        `<meta http-equiv="refresh" content="0;url=${escaped}">` +
        seoTag +
        `<script>location.replace(${jsTarget})</script>` +
        "<title>Redirecting...</title>" +
        "</head><body>" +
        `<a href="${escaped}">Redirecting...</a>` +
        "</body></html>\n"
    );
}

/** Maps a redirect's own slug to the static file it's written to under `dist-web`. */
export const redirectFile = (slug: string): string => `${cleanSlug(slug)}.html`;
