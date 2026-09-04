import type { ContentDto } from "luminary-shared";

// `url` must carry the link: t.me/share/url treats it as the thing being shared and
// bounces to Telegram's home page when it's empty, whatever `text` holds. Telegram
// composes the draft as `url` then `text`, so the link sits above the quote.
export function buildTelegramShareUrl(text: string, url: string): string {
    const shareUrl = new URL("https://t.me/share/url");
    shareUrl.searchParams.set("url", url);
    shareUrl.searchParams.set("text", text);
    return shareUrl.toString();
}

// web.whatsapp.com, not wa.me / api.whatsapp.com — both of those are registered as
// OS-level Universal Links, so the click is handed straight to the native desktop app
// before the page (or the `text` param) is involved, and the app's own handler drops
// everything but the trailing URL. web.whatsapp.com isn't a Universal Link target, so
// it opens as a normal page and keeps the full pre-filled text intact.
export function buildWhatsAppShareUrl(text: string): string {
    const shareUrl = new URL("https://web.whatsapp.com/send");
    shareUrl.searchParams.set("text", text);
    return shareUrl.toString();
}

export function buildXShareUrl(text: string, url: string): string {
    const shareUrl = new URL("https://twitter.com/intent/tweet");
    shareUrl.searchParams.set("text", text);
    shareUrl.searchParams.set("url", url);
    return shareUrl.toString();
}

// Reddit's link-submit intent only takes a title, not a body — passing one turns the
// submission into a text post instead of a link share.
export function buildRedditShareUrl(title: string, url: string): string {
    const shareUrl = new URL("https://www.reddit.com/submit");
    shareUrl.searchParams.set("url", url);
    shareUrl.searchParams.set("title", title);
    return shareUrl.toString();
}

const EXCERPT_MAX_LENGTH = 220;

// Plain-text excerpt of an article's first paragraph, trimmed to a whole word and
// marked with an ellipsis when cut short — gives a taste of the actual content rather
// than just the title/summary. Parsing the CMS-authored HTML into a detached element is
// safe: it's never inserted into the document, so nothing in it can execute. Returns
// empty during a prerender, where there is no DOM (and nothing shares).
export function firstParagraphExcerpt(html: string | undefined): string {
    if (!html || typeof document === "undefined") return "";
    const container = document.createElement("div");
    container.innerHTML = html;
    const text = (container.querySelector("p")?.textContent ?? container.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    if (text.length <= EXCERPT_MAX_LENGTH) return text;
    const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(" ");
    return `${truncated.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH)}…`;
}

type ShareMessageInput = {
    /** The quoted passage: a reader's text selection, or an excerpt of the article. */
    quote?: string;
    title: string;
    copyright?: string;
    /**
     * Appended as the closing line. Only for targets that don't take the link as their
     * own parameter (Telegram, WhatsApp, Instagram, clipboard); passing it to the others
     * would show the link twice.
     */
    url?: string;
};

/** The one share/copy layout: quote, attribution, then the bare link. */
export function formatShareMessage({ quote, title, copyright, url }: ShareMessageInput): string {
    // The copyright line is marked with © rather than the attribution dash, unless the
    // notice already carries the symbol itself.
    const notice = copyright?.trim();
    const copyrightLine = notice && (notice.includes("©") ? notice : `© ${notice}`);

    const attribution = [`— from “${title}”`, copyrightLine].filter(Boolean).join("\n");

    return [quote ? `“${quote}”` : undefined, attribution, url].filter(Boolean).join("\n\n");
}

// The hero's aspect ratio, so the shared image is the one the reader saw on the page.
const HERO_ASPECT_RATIO = 1.78;

// Instagram re-encodes what it receives to about this width, so a bigger variant costs
// the reader bytes without reaching them any sharper.
const SHARE_IMAGE_TARGET_WIDTH = 1080;

/** URL of the image variant to attach to a share, or undefined when the post has no image. */
export function shareImageUrl(content: ContentDto, bucketBaseUrl?: string): string | undefined {
    const collections = content.parentImageData?.fileCollections ?? [];
    if (!bucketBaseUrl || !collections.length) return undefined;

    const collection = collections.reduce((closest, candidate) =>
        Math.abs(candidate.aspectRatio - HERO_ASPECT_RATIO) <
        Math.abs(closest.aspectRatio - HERO_ASPECT_RATIO)
            ? candidate
            : closest,
    );

    const files = collection.imageFiles ?? [];
    if (!files.length) return undefined;

    const file = files.reduce((closest, candidate) =>
        Math.abs(candidate.width - SHARE_IMAGE_TARGET_WIDTH) <
        Math.abs(closest.width - SHARE_IMAGE_TARGET_WIDTH)
            ? candidate
            : closest,
    );

    return `${bucketBaseUrl.replace(/\/$/, "")}/${file.filename}`;
}

/**
 * Fetch a share image as a `File`. Resolves undefined on any failure (offline, CORS, a
 * non-image response) so a share still goes out as text.
 */
export async function fetchShareImageFile(url: string): Promise<File | undefined> {
    try {
        const response = await fetch(url);
        if (!response.ok) return undefined;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return undefined;
        return new File([blob], url.split("/").pop() || "share-image", { type: blob.type });
    } catch {
        return undefined;
    }
}
