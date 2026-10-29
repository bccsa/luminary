/**
 * Where the YouTube page is written. The app frames the folder, which every host serves the same way: the static
 * site's storage drops `.html` from a file's address, while nginx keeps it. The `.html` file stays for app builds
 * that already frame it.
 */
export const PAGE_FILES = ["youtube-embed/index.html", "youtube-embed.html"];
const PAGE_PATHS = ["/youtube-embed/", "/youtube-embed.html"];

/** Whether a dev-server request is for the page, at either of its addresses. */
export const isPageRequest = (url: string | undefined): boolean =>
    PAGE_PATHS.includes(url?.split("?")[0] ?? "");
