import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import {
    decay,
    DocType,
    PostType,
    TagType,
    type AffinityMap,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { rank, affinityScoreScale } from "@/recommendation/ranking";
import { affinityProfile } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { getSeenArticleIds } from "@/recommendation/seenStore";
import { sessionNow } from "@/util/sessionNow";
import { hasVideoSource } from "@/util/videoSource";

/** How many of each to offer: a handful, not a feed. */
const UP_NEXT_LIMIT = 10;
/** A series is shown whole, up to the size of the query that fetches it. */
const SERIES_LIMIT = 50;
/** The related-content ranking's tie-break weight: affinity only orders near-equals. */
const AFFINITY_WEIGHT = 0.01;

/** A tag the content has, to narrow what is offered to: a series is a category, the rest topics. */
export type UpNextTag = { id: Uuid; title: string; series: boolean };

/**
 * What is offered after what plays: the series it belongs to (all of it, the playing one included, so the
 * viewer sees where it sits), the ones still to come in it, then related content.
 */
export type UpNext = {
    series: ContentDto[];
    /** The series' category, in the viewer's language as the query found it; none when there is no series. */
    seriesTitle?: string;
    next: ContentDto[];
    related: ContentDto[];
    tags: UpNextTag[];
};

/**
 * What to play after `content`.
 *
 * **The series.** A series is a category the content is tagged with (a conference, a
 * gathering): all its contents that have media, in date order, so the Friday evening is followed
 * by the Saturday afternoon, not by whichever was published last. The playing one is among them.
 * **Next** is those that come after it.
 *
 * **Related.** Everything else from the same topics, chosen the way the article's related content
 * is: ranked by tag overlap and recency with affinity as a mild tie-break. Unlike an article, a
 * video is worth offering again (a conference's meetings are watched in turn, and again), so what
 * has been seen stays, after what has not.
 *
 * **A chosen tag** narrows both lists to that tag. A series tag keeps its "next in the series"; a
 * topic has no "next", only related content. Without one, every tag of the content counts.
 *
 * Only content that has media, and never the content's own translations.
 */
export function useUpNext(
    content: Ref<ContentDto | undefined>,
    selectedTag: Ref<Uuid | null> = ref(null),
): ComputedRef<UpNext> {
    const docs = useContentQuery(
        () => {
            const tags = selectedTag.value
                ? [selectedTag.value]
                : (content.value?.parentTags ?? []);
            return [
                // Newer content has only the parent's encoded media, older only the per-language URL.
                {
                    $or: [
                        { $and: [{ video: { $exists: true, $ne: "" } }, { video: { $ne: null } }] },
                        { "parentMedia.hlsUrl": { $exists: true, $ne: "" } },
                    ],
                },
                {
                    $or: [
                        { parentPostType: { $exists: false } },
                        { parentPostType: { $ne: PostType.Page } },
                    ],
                },
                { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] },
                ...(tags.length ? [{ parentTags: { $elemMatch: { $in: tags } } }] : []),
                // Nothing to follow: no query, rather than every video there is.
                ...(content.value ? [] : [{ parentId: { $in: [] } }]),
            ];
        },
        {
            includeScheduled: false,
            sort: [{ publishDate: "desc" }],
            limit: 50,
            // Choosing another tag asks again: the lists stay as they were until the answer is in.
            keepPreviousResult: true,
        },
    );

    // The categories the content is tagged with: what makes a series.
    const categories = useContentQuery(
        () => [
            {
                parentId: {
                    $in: content.value?.parentTags?.length ? content.value.parentTags : [],
                },
            },
            { parentType: DocType.Tag },
            { parentTagType: TagType.Category },
        ],
        { cache: true, keepPreviousResult: true },
    );

    // Every tag the content has, for the viewer to choose from.
    const tagDocs = useContentQuery(
        () => [
            {
                parentId: {
                    $in: content.value?.parentTags?.length ? content.value.parentTags : [],
                },
            },
            { parentType: DocType.Tag },
        ],
        { cache: true, keepPreviousResult: true },
    );

    // One snapshot of what the viewer has seen and liked per item: watching it writes those very
    // signals, and the list must not reshuffle under them.
    const affinity = shallowRef<AffinityMap>({});
    const seen = shallowRef<Set<Uuid>>(new Set());
    watch(
        () => content.value?.parentId,
        () => {
            affinity.value = decay(
                affinityProfile.value,
                sessionNow(),
                affinityConfig.value,
            ).affinity;
            seen.value = new Set(getSeenArticleIds());
        },
        { immediate: true },
    );
    const scoreScale = affinityScoreScale(affinityConfig.value.eventWeight.completion);

    return computed(() => {
        const current = content.value;
        if (!current) return { series: [], next: [], related: [], tags: [] };
        const withMedia = docs.value.filter(
            (doc) =>
                hasVideoSource(doc) &&
                (!selectedTag.value || (doc.parentTags ?? []).includes(selectedTag.value)),
        );
        const candidates = withMedia.filter((doc) => doc.parentId !== current.parentId);

        const seriesTagIds = new Set(categories.value.map((tag) => tag.parentId));
        const chosen = selectedTag.value;
        // A topic has no "next": only a series is something one goes through in order.
        const inSeries = (doc: ContentDto) =>
            chosen
                ? seriesTagIds.has(chosen) && (doc.parentTags ?? []).includes(chosen)
                : (doc.parentTags ?? []).some((tagId) => seriesTagIds.has(tagId));
        const byDate = (a: ContentDto, b: ContentDto) =>
            (a.publishDate ?? 0) - (b.publishDate ?? 0);
        // The playing one may be missing from the query's answer (its own translation, say): it is
        // still the one to mark, so it is put in.
        const seriesDocs = [
            ...(withMedia.some((doc) => doc.parentId === current.parentId) ? [] : [current]),
            ...withMedia,
        ]
            .filter((doc) => doc.parentId === current.parentId || inSeries(doc))
            .sort(byDate);
        const series = seriesDocs.length > 1 ? seriesDocs.slice(0, SERIES_LIMIT) : [];
        const after = current.publishDate ?? 0;
        const next = candidates
            .filter((doc) => inSeries(doc) && (doc.publishDate ?? 0) > after)
            .sort(byDate)
            .slice(0, UP_NEXT_LIMIT);

        const nextIds = new Set(series.map((doc) => doc._id));
        const tags = new Set(chosen ? [chosen] : (current.parentTags ?? []));
        const ranked = rank(
            candidates.filter((doc) => !nextIds.has(doc._id)),
            [],
            affinity.value,
            {
                topicTagIds: tags,
                scoreScale,
                tagWeight: AFFINITY_WEIGHT,
                referenceTagIds: tags,
                referenceWeight: 1.0,
                maxPerDominantTag: 100,
                now: sessionNow(),
            },
        );
        // Stable: within each group the ranking's order stands.
        const related = [
            ...ranked.filter((doc) => !seen.value.has(doc._id)),
            ...ranked.filter((doc) => seen.value.has(doc._id)),
        ].slice(0, UP_NEXT_LIMIT);

        // In the content's own order, the series first.
        const order = current.parentTags ?? [];
        const available = new Map(tagDocs.value.map((tag) => [tag.parentId, tag]));
        const tagList: UpNextTag[] = order
            .filter((id) => available.has(id))
            .map((id) => ({
                id,
                title: available.get(id)!.title,
                series: seriesTagIds.has(id),
            }))
            .sort((a, b) => Number(b.series) - Number(a.series));

        // The chosen category, else the first of the content's own: what the series is.
        const seriesId =
            chosen && seriesTagIds.has(chosen) ? chosen : order.find((id) => seriesTagIds.has(id));
        const seriesTitle = series.length
            ? categories.value.find((tag) => tag.parentId === seriesId)?.title
            : undefined;

        return { series, ...(seriesTitle ? { seriesTitle } : {}), next, related, tags: tagList };
    });
}
