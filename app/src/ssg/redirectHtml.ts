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

export function redirectHtml(toSlug: string): string {
    const target = `/${cleanSlug(toSlug)}`;
    const escaped = escapeAttr(target);
    const jsTarget = JSON.stringify(target).replace(/</g, "\\u003c");

    return (
        "<!doctype html><html><head>" +
        '<meta charset="utf-8">' +
        `<meta http-equiv="refresh" content="0;url=${escaped}">` +
        `<link rel="canonical" href="${escaped}">` +
        `<script>location.replace(${jsTarget})</script>` +
        "<title>Redirecting...</title>" +
        "</head><body>" +
        `<a href="${escaped}">Redirecting...</a>` +
        "</body></html>\n"
    );
}

export const redirectFile = (slug: string): string => `${cleanSlug(slug)}.html`;
