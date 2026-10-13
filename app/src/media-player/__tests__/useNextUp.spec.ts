import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { ContentDto } from "luminary-shared";
import { useNextUp } from "../useNextUp";
import type { UpNext } from "../useUpNext";

vi.mock("@/composables/useBucketInfo", () => ({
    useStorageBuckets: () => ref([{ _id: "bucket-1", publicUrl: "https://cdn.example.com" }]),
}));
vi.mock("@/util/fallbackArtwork", () => ({
    fallbackImageFor: (id: string) => (id ? `/fallback-${id}.webp` : undefined),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const doc = (id: string, extra: Record<string, unknown> = {}) =>
    ({
        _id: id,
        title: `Title ${id}`,
        publishDate: Date.UTC(2026, 9, 3, 12),
        parentImageBucketId: "bucket-1",
        parentImageData: {
            fileCollections: [
                {
                    aspectRatio: 1.78,
                    imageFiles: [
                        { width: 240, height: 135, filename: "small.webp" },
                        { width: 480, height: 270, filename: "mid.webp" },
                        { width: 1080, height: 607, filename: "big.webp" },
                    ],
                },
            ],
        },
        parentId: `${id}-parent`,
        ...extra,
    }) as unknown as ContentDto;

const upNext = (next: ContentDto[], related: ContentDto[]) =>
    computed<UpNext>(() => ({ next, related, tags: [] }));

describe("useNextUp", () => {
    it("lists the next in the series before related content", () => {
        const { nextContents, nextUp } = useNextUp(upNext([doc("series")], [doc("related")]));
        expect(nextContents.value.map((d) => d._id)).toEqual(["series", "related"]);
        expect(nextUp.value.map((i) => i.section)).toEqual([
            "media_player.next_in_series",
            "media_player.related",
        ]);
    });

    it("leaves out repeats and stops at five", () => {
        const related = Array.from({ length: 14 }, (_, i) => doc(`r${i}`));
        const { nextContents } = useNextUp(upNext([doc("r0"), doc("s1")], related));
        const ids = nextContents.value.map((d) => d._id);
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
        expect(ids.slice(0, 3)).toEqual(["r0", "s1", "r1"]);
    });

    it("offers nothing when there is nothing to follow", () => {
        const { nextContents, nextUp } = useNextUp(upNext([], []));
        expect(nextContents.value).toEqual([]);
        expect(nextUp.value).toEqual([]);
    });

    it("maps to the player's items, without a date, with a small picture from the document's bucket", () => {
        const { nextUp } = useNextUp(upNext([doc("a")], []));
        expect(nextUp.value[0]).toMatchObject({
            id: "a",
            title: "Title a",
            imageUrl: "https://cdn.example.com/mid.webp",
        });
        expect(nextUp.value[0]?.subtitle).toBeUndefined();
    });

    it("leaves out a picture the document does not have", () => {
        const { nextUp } = useNextUp(upNext([doc("a", { parentImageData: undefined })], []));
        expect(nextUp.value[0]?.imageUrl).toBeUndefined();
    });

    it("builds the width ladder as LImage does, from the document's bucket", () => {
        const { nextUp } = useNextUp(upNext([doc("a")], []));
        expect(nextUp.value[0]?.imageSrcset).toBe(
            "https://cdn.example.com/small.webp 240w, https://cdn.example.com/mid.webp 480w, https://cdn.example.com/big.webp 1080w",
        );
    });

    it("uses the collection nearest 16:9, and the others only when it has no files", () => {
        const files = (n: string) => [{ width: 100, height: 100, filename: n }];
        const { nextUp } = useNextUp(
            upNext(
                [
                    doc("a", {
                        parentImageData: {
                            fileCollections: [
                                { aspectRatio: 1, imageFiles: files("square.webp") },
                                { aspectRatio: 1.78, imageFiles: files("wide.webp") },
                            ],
                        },
                    }),
                    doc("b", {
                        parentImageData: {
                            fileCollections: [
                                { aspectRatio: 1.78, imageFiles: [] },
                                { aspectRatio: 1, imageFiles: files("square.webp") },
                            ],
                        },
                    }),
                ],
                [],
            ),
        );
        expect(nextUp.value[0]?.imageSrcset).toBe("https://cdn.example.com/wide.webp 100w");
        expect(nextUp.value[1]?.imageSrcset).toBe("https://cdn.example.com/square.webp 100w");
    });

    it("always names the app's fallback picture, and no ladder for a document with no image", () => {
        const { nextUp } = useNextUp(upNext([doc("a", { parentImageData: undefined })], []));
        expect(nextUp.value[0]).toMatchObject({ fallbackImageUrl: "/fallback-a-parent.webp" });
        expect(nextUp.value[0]?.imageSrcset).toBeUndefined();
        expect(nextUp.value[0]?.imageUrl).toBeUndefined();
    });
});
