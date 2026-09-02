import { ApiClient } from "./http";
import { CouchClient } from "./couch";

export type SampleContent = {
    _id: string;
    slug?: string;
    title?: string;
    language?: string;
    parentId?: string;
    parentType?: string;
    parentTags?: string[];
    memberOf?: string[];
};

/**
 * Corpus facts the request catalogue is built from. Everything the requests reference is
 * discovered through the API under the audit's own identity, so no catalogue entry can
 * fail with a permission error that would be mistaken for a slow or broken endpoint.
 */
export type PerfContext = {
    languages: string[];
    groups: string[];
    contentGroups: string[];
    postIds: string[];
    tagIds: string[];
    content: SampleContent[];
    slugs: string[];
    parentIds: string[];
    /** Search terms picked from real titles: one frequent, one rare, plus a guaranteed miss. */
    ftsCommonTerm: string;
    ftsRareTerm: string;
    ftsMissTerm: string;
    userTerm?: string;
    redirectTerm?: string;
    /** A Storage doc id, so the bucket probe can be timed rather than rejected on a missing param. */
    storageBucketId?: string;
    counts: Record<string, number>;
    dbSizeBytes: number;
    anonymous: boolean;
};

export async function discoverContext(api: ApiClient, couch: CouchClient): Promise<PerfContext> {
    const languages = await sample(api, { type: "language" }, 50);
    const groups = await sample(api, { type: "group" }, 200);
    const posts = await sample(api, { type: "post" }, 100);
    const tags = await sample(api, { type: "tag" }, 100);
    const content = await sample(api, { type: "content", parentType: "post" }, 200);
    const users = await sample(api, { type: "user" }, 50);
    const redirects = await sample(api, { type: "redirect" }, 50);
    const storage = await sample(api, { type: "storage" }, 5);

    if (!languages.length && !content.length) {
        throw new Error(
            "Discovery returned nothing. The audit identity can see no documents — either the API " +
                "is pointed at an empty database, or the anonymous identity has no default groups " +
                "(no provider-less AutoGroupMappings doc). Supply --token/--provider to run authenticated.",
        );
    }

    const contentGroups = unique(content.flatMap((d) => d.memberOf ?? []));
    const terms = pickTerms(content.map((d) => d.title ?? ""));

    const dbInfo = await couch.dbInfo().catch(() => ({ sizes: { file: 0 } }));
    const counts: Record<string, number> = {};
    for (const type of [
        "content",
        "post",
        "tag",
        "language",
        "group",
        "user",
        "redirect",
        "deleteCmd",
    ]) {
        counts[type] = await couch.countByType(type).catch(() => -1);
    }

    return {
        languages: languages.map((d) => d._id),
        groups: unique([...groups.map((d) => d._id), ...contentGroups]),
        contentGroups,
        postIds: posts.map((d) => d._id),
        tagIds: tags.map((d) => d._id),
        content,
        slugs: unique(content.map((d) => d.slug).filter(Boolean) as string[]),
        parentIds: unique(content.map((d) => d.parentId).filter(Boolean) as string[]),
        ftsCommonTerm: terms.common,
        ftsRareTerm: terms.rare,
        ftsMissTerm: "zzqxvwmpk",
        userTerm: firstTerm(users.map((d: any) => d.name ?? d.email ?? "")),
        redirectTerm: firstTerm(redirects.map((d: any) => d.slug ?? "")),
        storageBucketId: storage[0]?._id,
        counts,
        dbSizeBytes: (dbInfo as any)?.sizes?.file ?? 0,
        anonymous: !api.headers["Authorization"],
    };
}

/** Discovery queries deliberately omit `use_index` — index choice is what the audit measures, not a prerequisite for it. */
async function sample(api: ApiClient, selector: Record<string, unknown>, limit: number) {
    const res = await api.post<{ docs: SampleContent[] }>(
        "/query",
        { selector, limit, identifier: "sync" },
        true,
    );
    if (!res.ok) return [];
    return res.body?.docs ?? [];
}

/** Stop words that would make a "common term" search meaningless as a benchmark. */
const STOP_WORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "you",
    "are",
    "not",
]);

function pickTerms(titles: string[]): { common: string; rare: string } {
    const freq = new Map<string, number>();
    for (const title of titles) {
        for (const word of title.toLowerCase().split(/[^a-z0-9]+/i)) {
            if (word.length < 4 || STOP_WORDS.has(word)) continue;
            freq.set(word, (freq.get(word) ?? 0) + 1);
        }
    }
    const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    return {
        common: ranked[0]?.[0] ?? "content",
        rare: ranked[ranked.length - 1]?.[0] ?? "kaleidoscope",
    };
}

function firstTerm(values: string[]): string | undefined {
    for (const value of values) {
        const word = value.split(/[^a-z0-9]+/i).find((w) => w.length >= 4);
        if (word) return word.toLowerCase();
    }
    return undefined;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
