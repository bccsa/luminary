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
// than just the title/summary. Runs client-side only (a click handler), so parsing the
// CMS-authored HTML into a detached, never-attached element is safe: it's never
// inserted into the document, so nothing in it can execute.
export function firstParagraphExcerpt(html: string | undefined): string {
    if (!html) return "";
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
    const attribution = [`— from “${title}”`, copyright && `— ${copyright}`]
        .filter(Boolean)
        .join("\n");

    return [quote ? `“${quote}”` : undefined, attribution, url].filter(Boolean).join("\n\n");
}
