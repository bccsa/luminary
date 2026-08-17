import { resolveCollectionPrefix } from "./deleteMediaCollection";

/** A real collection URL: MinIO, where the bucket name is part of the public path. */
const PUBLIC = "http://localhost:9000/media";
const SESSION = "c5829f07-4ba8-42ed-a449-80d83e6c0b53";
const HLS = `${PUBLIC}/${SESSION}/master.m3u8`;

const prefixOf = (r: ReturnType<typeof resolveCollectionPrefix>) =>
    "prefix" in r ? r.prefix : undefined;
const refusalOf = (r: ReturnType<typeof resolveCollectionPrefix>) =>
    "refusal" in r ? r.refusal : undefined;

describe("resolveCollectionPrefix", () => {
    describe("resolves a collection this API wrote", () => {
        it("strips the bucket's public base and the master filename", () => {
            expect(prefixOf(resolveCollectionPrefix(HLS, PUBLIC))).toBe(SESSION);
        });

        it("tolerates a trailing slash on the configured public URL", () => {
            expect(prefixOf(resolveCollectionPrefix(HLS, `${PUBLIC}/`))).toBe(SESSION);
            expect(prefixOf(resolveCollectionPrefix(HLS, `${PUBLIC}///`))).toBe(SESSION);
        });

        it("keeps a nested path prefix intact", () => {
            // pathPrefix on the session puts the collection in a subfolder.
            const url = `${PUBLIC}/tenant-a/videos/${SESSION}/master.m3u8`;
            expect(prefixOf(resolveCollectionPrefix(url, PUBLIC))).toBe(
                `tenant-a/videos/${SESSION}`,
            );
        });

        it("ignores a query string or fragment", () => {
            expect(prefixOf(resolveCollectionPrefix(`${HLS}?v=2`, PUBLIC))).toBe(SESSION);
            expect(prefixOf(resolveCollectionPrefix(`${HLS}#top`, PUBLIC))).toBe(SESSION);
        });

        it("handles a bucket published at a bare host", () => {
            const base = "https://cdn.example.com";
            expect(
                prefixOf(resolveCollectionPrefix(`${base}/${SESSION}/master.m3u8`, base)),
            ).toBe(SESSION);
        });
    });

    describe("refuses anything it cannot prove it wrote", () => {
        it("refuses a URL in a different bucket", () => {
            const other = "https://someone-elses-cdn.example.com/media";
            expect(refusalOf(resolveCollectionPrefix(`${other}/${SESSION}/master.m3u8`, PUBLIC)))
                .toMatch(/not in this bucket/);
        });

        it("refuses a bucket whose name merely prefixes another", () => {
            // The separator is part of the match, or `…/media` would claim
            // `…/media-archive/<session>/master.m3u8`.
            const url = `${PUBLIC}-archive/${SESSION}/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/not in this bucket/);
        });

        it("refuses a URL that is not a master playlist", () => {
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/${SESSION}/`, PUBLIC)))
                .toMatch(/master playlist/);
            expect(
                refusalOf(
                    resolveCollectionPrefix(`${PUBLIC}/${SESSION}/stream/playlist.m3u8`, PUBLIC),
                ),
            ).toMatch(/master playlist/);
        });

        it("refuses the bucket root", () => {
            expect(refusalOf(resolveCollectionPrefix(`${PUBLIC}/master.m3u8`, PUBLIC)))
                .toMatch(/bucket root/);
        });

        it("refuses a path that tries to climb out", () => {
            const url = `${PUBLIC}/../other-tenant/${SESSION}/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/suspicious path/);
        });

        it("refuses a folder that is not a session id", () => {
            // The case the tick box makes possible: hlsUrl is editable, so someone
            // can paste a URL naming a folder shared with other content.
            const url = `${PUBLIC}/shared-videos/master.m3u8`;
            expect(refusalOf(resolveCollectionPrefix(url, PUBLIC))).toMatch(/not a session id/);
        });

        it("refuses when either side is missing", () => {
            expect(refusalOf(resolveCollectionPrefix(undefined, PUBLIC))).toMatch(/no media URL/);
            expect(refusalOf(resolveCollectionPrefix(HLS, undefined))).toMatch(/no public URL/);
            expect(refusalOf(resolveCollectionPrefix("", PUBLIC))).toMatch(/no media URL/);
        });
    });

    it("never returns a prefix with a leading or trailing slash", () => {
        // The caller appends '/' to scope the listing; a stray slash would widen it.
        const prefix = prefixOf(resolveCollectionPrefix(HLS, PUBLIC))!;
        expect(prefix.startsWith("/")).toBe(false);
        expect(prefix.endsWith("/")).toBe(false);
    });
});
