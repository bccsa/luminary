import { isInOurStorage, isBucketRelative, toAbsoluteMediaUrl, toStoredMediaUrl } from "./mediaUrl";

const BASE = "https://cdn.example.com/media";
const REL = "/c5829f07-4ba8-42ed-a449-80d83e6c0b53/master.m3u8";

describe("media URL storage form", () => {
    describe("toStoredMediaUrl", () => {
        it("strips the bucket's public URL", () => {
            expect(toStoredMediaUrl(`${BASE}${REL}`, BASE)).toBe(REL);
        });

        it("tolerates a trailing slash on the bucket", () => {
            expect(toStoredMediaUrl(`${BASE}${REL}`, `${BASE}/`)).toBe(REL);
        });

        it("leaves a YouTube URL alone", () => {
            const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
            expect(toStoredMediaUrl(yt, BASE)).toBe(yt);
        });

        it("leaves an HLS master on someone else's CDN alone", () => {
            const other = "https://other.example.com/stream/master.m3u8";
            expect(toStoredMediaUrl(other, BASE)).toBe(other);
        });

        it("does not claim a bucket that merely shares a prefix", () => {
            // `…/media` must not swallow `…/media-archive`.
            const neighbour = "https://cdn.example.com/media-archive/x/master.m3u8";
            expect(toStoredMediaUrl(neighbour, BASE)).toBe(neighbour);
        });

        it("is idempotent — storing an already-relative URL changes nothing", () => {
            expect(toStoredMediaUrl(REL, BASE)).toBe(REL);
        });

        it("returns the input when the bucket has no public URL", () => {
            const abs = `${BASE}${REL}`;
            expect(toStoredMediaUrl(abs, undefined)).toBe(abs);
        });
    });

    describe("toAbsoluteMediaUrl", () => {
        it("joins a relative URL onto the bucket", () => {
            expect(toAbsoluteMediaUrl(REL, BASE)).toBe(`${BASE}${REL}`);
        });

        it("leaves an external URL untouched", () => {
            const yt = "https://youtu.be/dQw4w9WgXcQ";
            expect(toAbsoluteMediaUrl(yt, BASE)).toBe(yt);
        });

        it("cannot resolve a relative URL without a bucket", () => {
            expect(toAbsoluteMediaUrl(REL, undefined)).toBeUndefined();
        });

        it("round-trips", () => {
            const abs = `${BASE}${REL}`;
            expect(toAbsoluteMediaUrl(toStoredMediaUrl(abs, BASE), BASE)).toBe(abs);
        });
    });

    it("recognises the stored form", () => {
        expect(isBucketRelative(REL)).toBe(true);
        expect(isBucketRelative(`${BASE}${REL}`)).toBe(false);
        expect(isBucketRelative(undefined)).toBe(false);
    });
});

/**
 * What decides whether `mediaBucketId` is required. A bucket is how a URL is
 * stored relative, how a bucket change migrates the files, and how deleting the
 * document finds them — all meaningless for a collection that is not ours.
 */
describe("isInOurStorage", () => {
    const BUCKETS = ["https://cdn.example.com/media", "http://test.com/media"];

    it("claims a bucket-relative URL, which is nothing without a bucket", () => {
        expect(isInOurStorage("/abc/master.m3u8", [])).toBe(true);
    });

    it("claims an absolute URL under a configured bucket", () => {
        expect(isInOurStorage("https://cdn.example.com/media/abc/master.m3u8", BUCKETS)).toBe(true);
    });

    it("disclaims a YouTube link", () => {
        expect(isInOurStorage("https://www.youtube.com/watch?v=rExcQ5nm_yU", BUCKETS)).toBe(false);
    });

    it("disclaims an HLS master on someone else's CDN", () => {
        expect(isInOurStorage("https://elsewhere.example/x/master.m3u8", BUCKETS)).toBe(false);
    });

    it("does not let one bucket claim another whose name it prefixes", () => {
        // The separator is part of the match, exactly as in toStoredMediaUrl.
        expect(isInOurStorage("https://cdn.example.com/media-archive/x.m3u8", BUCKETS)).toBe(false);
    });

    it("ignores a bucket with no public URL rather than matching everything", () => {
        expect(isInOurStorage("https://elsewhere.example/x.m3u8", [undefined, ""])).toBe(false);
    });

    it("is false for no URL at all", () => {
        expect(isInOurStorage(undefined, BUCKETS)).toBe(false);
    });
});
