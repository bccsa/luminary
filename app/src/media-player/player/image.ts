/**
 * An image as a host has it: a responsive candidate list, and a last resort.
 *
 * The player draws it itself, as an `<img>`, rather than handing it to
 * video.js's poster, which takes one URL and knows nothing of `srcset`. That is
 * also what keeps the shape engine-neutral: it describes an image, not a
 * video.js option, so it survives a change of engine unchanged.
 *
 * A host holding Luminary's `ImageDto` builds one the way `LImageProvider`
 * does: the file collection whose aspect ratio is closest to 16:9, each of its
 * files as `${bucketUrl}/${filename} ${width}w`, and one of its bundled
 * fallback images.
 */
export interface PlayerImage {
    /**
     * Candidates, as for `<img srcset>`:
     * `"https://…/art-640.webp 640w, https://…/art-1280.webp 1280w"`.
     *
     * The browser picks by rendered size and pixel ratio, and may settle for a
     * candidate it already holds — which is what keeps artwork on screen
     * offline, when only some of the widths were ever fetched.
     */
    srcset?: string;
    /**
     * As for `<img sizes>`. Omitted, the player supplies its own rendered
     * width, and `100vw` in fullscreen. A host with a reduced-data mode passes
     * its own, and it is used as given.
     */
    sizes?: string;
    /** A single URL — on its own, or alongside `srcset` as its plain candidate. */
    src?: string;
    /**
     * Shown when the image fails to load — offline with nothing cached, say.
     * Best an image the host ships with, so that it is always there.
     */
    fallback?: string;
}

/** What `poster` accepts: a bare URL is shorthand for `{ src }`. */
export type PlayerImageInput = string | PlayerImage;

/** The input as a `PlayerImage`, or null when it names nothing to draw. */
export function toPlayerImage(input: PlayerImageInput | null | undefined): PlayerImage | null {
    if (!input) return null;
    const image = typeof input === 'string' ? { src: input } : input;
    return image.srcset || image.src || image.fallback ? image : null;
}

/** One `<img>` attempt: the image itself first, then its fallback. */
export interface ImageAttempt {
    srcset?: string;
    src?: string;
}

/**
 * The order to try an image in. Advancing past the last attempt means the
 * image is given up on — drawing a broken-image glyph over the frame would be
 * worse than drawing nothing.
 */
export function imageAttempts(image: PlayerImage | null): ImageAttempt[] {
    if (!image) return [];
    const attempts: ImageAttempt[] = [];
    if (image.srcset || image.src) attempts.push({ srcset: image.srcset, src: image.src });
    if (image.fallback) attempts.push({ src: image.fallback });
    return attempts;
}
