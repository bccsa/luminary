import type { ContentDto } from "luminary-shared";

/** ContentTile, including media/progress badges, plus contentByTag grouping. */
export const CONTENT_TILE_SEED_FIELDS = [
    "parentId",
    "title",
    "slug",
    "language",
    "publishDate",
    "parentPublishDateVisible",
    "parentShowComingSoon",
    "parentImageData",
    "parentImageBucketId",
    "video",
    "parentMedia",
    "parentTags",
] as const satisfies readonly (keyof ContentDto)[];

/** Section headings, contentByTag ordering, and the dependent pinned-content query. */
export const CATEGORY_ROW_SEED_FIELDS = [
    "parentId",
    "title",
    "summary",
    "parentPinned",
    "parentTaggedDocs",
    "parentUseVerticalTileLayout",
] as const satisfies readonly (keyof ContentDto)[];

/**
 * Project ONLY the SSR cache copy. Unconfigured queries keep their existing fields
 * (apart from unused slug history). Identity/version and sort fields always survive
 * so HybridQuery can merge, order, retain and retire the seed normally.
 *
 * Keep nested values intact, especially parentImageData: LImage keys its provider
 * by JSON.stringify(image). Trimming/reordering that object would remount the image
 * when the full live document arrives. No fetched or rendered document is mutated.
 */
export function projectContentSeed(
    docs: ContentDto[],
    fields?: readonly (keyof ContentDto)[],
    sort?: Array<Record<string, "asc" | "desc">>,
): ContentDto[] {
    const keep = fields
        ? new Set<string>([
              "_id",
              "type",
              "updatedTimeUtc",
              "publishDate", // HybridQuery's offline-retention check
              ...fields,
              ...(sort ?? []).flatMap((entry) =>
                  Object.keys(entry).map((key) => key.split(".")[0]),
              ),
          ])
        : undefined;

    return docs.map(
        (doc) =>
            Object.fromEntries(
                Object.entries(doc).filter(
                    ([key]) => key !== "previousSlugs" && (!keep || keep.has(key)),
                ),
            ) as ContentDto,
    );
}
