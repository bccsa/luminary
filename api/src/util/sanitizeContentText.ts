import * as sanitizeHtml from "sanitize-html";

// Exactly what the CMS rich-text editor can produce (TipTap StarterKit + Link + Underline)
const options: sanitizeHtml.IOptions = {
    allowedTags: [
        "p",
        "br",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "s",
        "strike",
        "code",
        "pre",
        "blockquote",
        "hr",
        "a",
    ],
    allowedAttributes: {
        a: ["href", "target", "rel"],
        code: ["class"],
        ol: ["start"],
    },
    // Only the language-* class the code block adds; arbitrary classes could match app CSS (e.g. fixed overlays)
    allowedClasses: { code: [/^language-[\w-]+$/] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    // Drop the contents of these entirely rather than leaving their text behind
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
    transformTags: {
        // A new-tab link must not hand the opened page a reference back to ours
        a: (tagName, attribs) => {
            if (attribs.target) attribs.rel = "noopener noreferrer nofollow";
            return { tagName, attribs };
        },
    },
};

/**
 * Strips everything the rich-text editor cannot produce (scripts, event handlers, `javascript:`
 * URLs, iframes) from stored article HTML. The app renders `text` with `v-html`, so it must be
 * safe at write time regardless of which client sent it.
 */
export function sanitizeContentText(html: string): string {
    if (!html) return html;

    return (
        sanitizeHtml(html, options)
            // Match the browser serializer the editor uses so a clean document round-trips unchanged
            // and the CMS does not see a spurious edit after saving
            .replace(/<br \/>/g, "<br>")
            .replace(/<hr \/>/g, "<hr>")
            .replace(/ /g, "&nbsp;")
    );
}
