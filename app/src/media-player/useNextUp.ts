import { computed, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ContentDto, Uuid } from "luminary-shared";
import type { PlayerUpNextItem } from "@luminary-media-converter/player-web";
import { useStorageBuckets } from "@/composables/useBucketInfo";
import { shareImageUrl } from "@/composables/useSocialShare";
import { aspectRatioNumbers } from "@/components/images/LImageProvider.vue";
import { fallbackImageFor } from "@/util/fallbackArtwork";
import type { UpNext } from "./useUpNext";

/** The card shows a small picture: about this wide is sharp enough without the full-size download. */
const NEXT_UP_IMAGE_WIDTH = 480;
/** How many videos the player offers at the end. */
export const NEXT_UP_LIMIT = 5;

/**
 * The width ladder of a document's picture, built as `LImage` builds it: the files of the 16:9-ish
 * collection under the bucket's address, else those of the other collections. Empty without a bucket
 * or files, so a card that cannot name a picture falls back instead of requesting a broken address.
 */
export function imageSrcsetFor(doc: ContentDto, bucketUrl: string | undefined): string {
    const collections = doc.parentImageData?.fileCollections ?? [];
    if (!bucketUrl || !collections.length) return "";
    const base = bucketUrl.replace(/\/$/, "");
    const wanted = aspectRatioNumbers.video;
    const closest = collections.reduce((best, c) =>
        Math.abs(c.aspectRatio - wanted) < Math.abs(best.aspectRatio - wanted) ? c : best,
    ).aspectRatio;
    const ladder = (list: typeof collections) =>
        list
            .flatMap((c) => [...(c.imageFiles ?? [])].sort((a, b) => a.width - b.width))
            .map((f) => `${base}/${f.filename} ${f.width}w`)
            .join(", ");
    return (
        ladder(collections.filter((c) => c.aspectRatio === closest)) ||
        ladder(collections.filter((c) => c.aspectRatio !== closest))
    );
}

/**
 * The videos the player offers at the end of the current one: the next in its series, then
 * related, without repeats. Returned as the documents (to navigate to) and as the player's plain items.
 * The browse panel gets its own list: the whole series with the playing one marked, then related.
 */
export function useNextUp(
    upNext: Ref<UpNext>,
    currentId: () => Uuid | undefined = () => undefined,
): {
    nextContents: ComputedRef<ContentDto[]>;
    nextUp: ComputedRef<PlayerUpNextItem[]>;
    browseContents: ComputedRef<ContentDto[]>;
    browseUpNext: ComputedRef<PlayerUpNextItem[]>;
} {
    const { t } = useI18n();
    const buckets = useStorageBuckets();

    const collect = (lists: [ContentDto[], string][]) => {
        const seen = new Set<string>();
        const out: { doc: ContentDto; section: string }[] = [];
        for (const [docs, section] of lists) {
            for (const doc of docs) {
                if (seen.has(doc._id)) continue;
                seen.add(doc._id);
                out.push({ doc, section });
            }
        }
        return out;
    };

    const toItem = ({ doc, section }: { doc: ContentDto; section: string }): PlayerUpNextItem => {
        const bucketUrl = buckets.value.find((b) => b._id === doc.parentImageBucketId)?.publicUrl;
        const imageUrl = shareImageUrl(doc, bucketUrl, NEXT_UP_IMAGE_WIDTH);
        const imageSrcset = imageSrcsetFor(doc, bucketUrl);
        const fallbackImageUrl = fallbackImageFor(doc.parentId);
        const current = doc.parentId === currentId();
        return {
            id: doc._id,
            title: doc.title,
            section,
            ...(current ? { current, subtitle: t("media_player.now_playing") } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageSrcset ? { imageSrcset } : {}),
            ...(fallbackImageUrl ? { fallbackImageUrl } : {}),
        };
    };

    const sections = computed(() =>
        collect([
            [upNext.value.next, t("media_player.next_in_series")],
            [upNext.value.related, t("media_player.related")],
        ]).slice(0, NEXT_UP_LIMIT),
    );
    const browseSections = computed(() =>
        collect([
            [upNext.value.series, t("media_player.in_series")],
            [upNext.value.related, t("media_player.related")],
        ]),
    );

    const nextContents = computed(() => sections.value.map((entry) => entry.doc));
    const nextUp = computed<PlayerUpNextItem[]>(() => sections.value.map(toItem));
    const browseContents = computed(() => browseSections.value.map((entry) => entry.doc));
    const browseUpNext = computed<PlayerUpNextItem[]>(() => browseSections.value.map(toItem));

    return { nextContents, nextUp, browseContents, browseUpNext };
}
