/**
 * One video offered after the one playing, as the browse panel lists it.
 * Kept to plain data so a native player can be handed the same list.
 */
export type PlayerUpNextItem = {
    /** Handed back by the `upnextselect` event. */
    id: string;
    title: string;
    subtitle?: string;
    /** A 16:9 picture. */
    imageUrl?: string;
    /** The picture's width ladder, as for `<img srcset>`; `imageUrl` stays its plain candidate. */
    imageSrcset?: string;
    /** Shown when the picture is absent or fails to load, so a card is never an empty or broken tile. */
    fallbackImageUrl?: string;
    /** A heading (e.g. "Next in series"), shown above the first item of each run that carries it. */
    section?: string;
    /** What plays now: marked where it stands in its list, and not a pick. */
    current?: boolean;
};

/** The items with the heading to draw above each: a section's name shows once, over its first item. */
export function withSectionHeadings(
    items: readonly PlayerUpNextItem[],
): { item: PlayerUpNextItem; heading: string | null }[] {
    return items.map((item, i) => ({
        item,
        heading: item.section && item.section !== items[i - 1]?.section ? item.section : null,
    }));
}
