import type { AffinityMap } from "luminary-shared";

/**
 * Put the CMS default affinity beneath the user's own: the user's tags keep their scores and rank
 * first, and default tags they lack are squeezed below their weakest so they only fill the
 * remaining slots. With no user evidence the default is used as-is (cold start).
 */
export function layerDefaultAffinity(user: AffinityMap, defaults?: AffinityMap): AffinityMap {
    if (!defaults) return user;
    const userScores = Object.values(user);
    if (!userScores.length) return { ...defaults };

    const ceiling = Math.min(...userScores) / 2;
    const extra = Object.entries(defaults).filter(([tag, score]) => !(tag in user) && score > 0);
    const top = Math.max(0, ...extra.map(([, score]) => score));
    const layered: AffinityMap = { ...user };
    for (const [tag, score] of extra) layered[tag] = (score / top) * ceiling;
    return layered;
}
