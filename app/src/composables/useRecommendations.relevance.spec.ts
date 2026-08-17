import { beforeEach, describe, expect, it } from "vitest";
import { effectScope } from "vue";
import waitForExpect from "wait-for-expect";
import {
    db,
    DocType,
    PublishStatus,
    recomputeCorpusStats,
    TagType,
    type AffinityProfile,
    type ContentDto,
    type TagDto,
} from "luminary-shared";
import {
    appLanguageIdsAsRef,
    appSyncedLanguageIdsAsRef,
} from "@/globalConfig";
import { affinityProfile } from "@/recommendation/affinityStore";
import { useRecommendations } from "./useRecommendations";

const LANGUAGE_ID = "lang-eng";
const MEMBER_OF = ["group-public-content"];
const TEST_AUTHOR = "Test Author";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const WAIT_TIMEOUT_MS = 15_000;

const TAGS = {
    prayer: "tag-prayer",
    politics: "tag-politics",
    health: "tag-health",
} as const;

type Cluster = keyof typeof TAGS;
type ArticleCopy = { title: string; summary: string; text: string };

const CLUSTER_ARTICLES: Record<Cluster, ArticleCopy[]> = {
    prayer: [
        {
            title: "Building a steady prayer habit",
            summary: "A practical prayer rhythm for busy mornings and quiet evenings.",
            text: "Set aside a regular place, begin with gratitude, and keep a simple prayer list that turns intention into a daily habit.",
        },
        {
            title: "A guide to intercessory prayer",
            summary: "How communities can pray thoughtfully for neighbours in need.",
            text: "Intercession listens before speaking, names real concerns, and returns faithfully to prayer for families, leaders, and local communities.",
        },
        {
            title: "Meditation and attentive prayer",
            summary: "Use silence and scripture to bring focus to reflective prayer.",
            text: "Slow breathing, a short sacred passage, and patient silence can settle distractions and deepen a meditative prayer practice.",
        },
        {
            title: "Understanding the Lord's Prayer",
            summary: "Explore the petitions, trust, and forgiveness within this central prayer.",
            text: "The Lord's Prayer moves from worship to daily bread, reconciliation, and courage, giving believers a pattern for honest prayer.",
        },
        {
            title: "Starting a prayer journal",
            summary: "Record requests, gratitude, and answers in a sustainable prayer journal.",
            text: "A dated notebook helps people notice recurring themes, remember answered prayer, and reflect on spiritual growth over time.",
        },
    ],
    politics: [
        {
            title: "How local elections shape daily life",
            summary: "A clear guide to politics, municipal elections, and public services.",
            text: "Local politics determines council budgets, roads, libraries, and water services, making informed participation in elections especially valuable.",
        },
        {
            title: "Understanding your local government",
            summary: "Learn how councils, committees, and public meetings make political decisions.",
            text: "Residents can follow local government agendas, attend hearings, and ask officials how political choices affect their neighbourhoods.",
        },
        {
            title: "A practical guide to voting rights",
            summary: "Know the registration rules and protections that support fair politics.",
            text: "Voting rights include accessible polling places, accurate voter rolls, secret ballots, and transparent ways to challenge election problems.",
        },
        {
            title: "Contacting your elected representatives",
            summary: "Make a concise political case to representatives about community concerns.",
            text: "A specific request, relevant evidence, and respectful follow-up help representatives understand what voters expect from public policy.",
        },
        {
            title: "Comparing party platforms carefully",
            summary: "Evaluate political promises, costs, and priorities before an election.",
            text: "Compare party platforms using primary documents, credible budget analysis, and consistent questions about how each politics proposal will work.",
        },
    ],
    health: [
        {
            title: "Everyday nutrition for lasting health",
            summary: "Build balanced meals with fibre, protein, vegetables, and healthy fats.",
            text: "Good health nutrition relies on varied whole foods, sensible portions, enough water, and habits that remain realistic during a busy week.",
        },
        {
            title: "Managing blood pressure at home",
            summary: "Use consistent measurements and healthy routines to understand blood pressure.",
            text: "Regular movement, less sodium, prescribed treatment, and a reliable cuff help people discuss blood pressure trends with a health professional.",
        },
        {
            title: "Sleep hygiene that supports health",
            summary: "Create a calm evening routine for deeper and more regular sleep.",
            text: "Consistent bedtimes, morning daylight, a cool room, and fewer late screens strengthen sleep hygiene and protect long-term health.",
        },
        {
            title: "Practical stress management",
            summary: "Reduce chronic stress with boundaries, breathing, and supportive relationships.",
            text: "Short recovery breaks, realistic planning, and conversations with trusted people can lower stress and support emotional health.",
        },
        {
            title: "Making exercise a weekly habit",
            summary: "Combine walking, strength, and mobility for sustainable physical health.",
            text: "Gradual exercise goals, enjoyable activities, and recovery days improve fitness while reducing the risk of abandoning a new health routine.",
        },
    ],
};

/** Mirrors the deliberately simple trigram test fixture used by shared/src/fts/fts.spec.ts. */
function generateSimpleFtsEntries(
    value: string,
    boost: number,
): { entries: string[]; tokenCount: number } {
    const normalized = value.toLowerCase();
    const entries: string[] = [];
    const seen = new Set<string>();
    let tokenCount = 0;

    for (let i = 0; i <= normalized.length - 3; i++) {
        const trigram = normalized.substring(i, i + 3);
        tokenCount++;
        if (!seen.has(trigram)) {
            seen.add(trigram);
            entries.push(`${trigram}:${boost}`);
        }
    }

    return { entries, tokenCount };
}

function mergeFtsEntries(
    ...fields: Array<{ entries: string[]; tokenCount: number }>
): { entries: string[]; tokenCount: number } {
    const aggregated = new Map<string, number>();
    let tokenCount = 0;

    for (const field of fields) {
        tokenCount += field.tokenCount;
        for (const entry of field.entries) {
            const colonIndex = entry.indexOf(":", 3);
            const token = entry.substring(0, colonIndex);
            const termFrequency = Number.parseFloat(entry.substring(colonIndex + 1));
            aggregated.set(token, (aggregated.get(token) ?? 0) + termFrequency);
        }
    }

    return {
        entries: [...aggregated].map(([token, termFrequency]) => `${token}:${termFrequency}`),
        tokenCount,
    };
}

function makeTopicTag(cluster: Cluster): TagDto {
    return {
        _id: TAGS[cluster],
        type: DocType.Tag,
        tagType: TagType.Topic,
        updatedTimeUtc: Date.now(),
        memberOf: MEMBER_OF,
        tags: [],
        pinned: 0,
        publishDateVisible: false,
        showComingSoon: false,
    };
}

function makeTagTitleContent(cluster: Cluster): ContentDto {
    return {
        _id: `content-${TAGS[cluster]}-${LANGUAGE_ID}`,
        type: DocType.Content,
        parentType: DocType.Tag,
        parentId: TAGS[cluster],
        parentTagType: TagType.Topic,
        updatedTimeUtc: Date.now(),
        memberOf: MEMBER_OF,
        parentTags: [],
        language: LANGUAGE_ID,
        status: PublishStatus.Published,
        slug: `${cluster}-topic`,
        title: cluster[0].toUpperCase() + cluster.slice(1),
        summary: `Articles about ${cluster}`,
        text: `A topic collection for ${cluster}.`,
        author: TEST_AUTHOR,
        publishDate: Date.now() - 24 * 60 * 60 * 1000,
    };
}

function makePostContent(
    id: string,
    parentTags: string[],
    copy: ArticleCopy,
    ageOffset: number,
): ContentDto {
    const doc: ContentDto = {
        _id: `content-${id}-${LANGUAGE_ID}`,
        type: DocType.Content,
        parentType: DocType.Post,
        parentId: `post-${id}`,
        updatedTimeUtc: Date.now(),
        memberOf: MEMBER_OF,
        parentTags,
        language: LANGUAGE_ID,
        status: PublishStatus.Published,
        slug: id,
        title: copy.title,
        summary: copy.summary,
        text: `<p>${copy.text}</p>`,
        author: TEST_AUTHOR,
        publishDate: Date.now() - (ageOffset % THIRTY_DAYS_MS),
    };
    const fts = mergeFtsEntries(
        generateSimpleFtsEntries(doc.title, 3),
        generateSimpleFtsEntries(doc.summary ?? "", 1.5),
        generateSimpleFtsEntries(doc.text ?? "", 1),
        generateSimpleFtsEntries(doc.author ?? "", 1),
    );
    doc.fts = fts.entries;
    doc.ftsTokenCount = fts.tokenCount;
    return doc;
}

function buildCorpus(): Array<TagDto | ContentDto> {
    const tags = (Object.keys(TAGS) as Cluster[]).map(makeTopicTag);
    const tagTitles = (Object.keys(TAGS) as Cluster[]).map(makeTagTitleContent);
    const articles = (Object.keys(CLUSTER_ARTICLES) as Cluster[]).flatMap((cluster, clusterIndex) =>
        CLUSTER_ARTICLES[cluster].map((copy, articleIndex) =>
            makePostContent(
                `${cluster}-${articleIndex + 1}`,
                [TAGS[cluster]],
                copy,
                (clusterIndex * 5 + articleIndex + 1) * 24 * 60 * 60 * 1000,
            ),
        ),
    );
    const noise = [
        makePostContent(
            "untagged-prayer-vocabulary",
            [],
            {
                title: "Finding words for prayer in a difficult season",
                summary: "An untagged reflection on honest prayer when concentration is hard.",
                text: "Simple sentences, silence, and trusted companions can make prayer possible even when a person feels tired or uncertain.",
            },
            18 * 24 * 60 * 60 * 1000,
        ),
        makePostContent(
            "unrelated-astronomy",
            ["tag-unrelated"],
            {
                title: "Watching a winter meteor shower",
                summary: "Plan a dark-sky evening to observe meteors and constellations.",
                text: "Check the cloud forecast, let your eyes adapt to darkness, and look across a broad patch of sky away from city lights.",
            },
            19 * 24 * 60 * 60 * 1000,
        ),
        makePostContent(
            "prayer-politics-bridge",
            [TAGS.prayer, TAGS.politics],
            {
                title: "Prayer and politics in public service",
                summary: "Reflective prayer can prepare citizens for patient political participation.",
                text: "Before contacting representatives or discussing elections, prayer can encourage humility, careful listening, and concern for neighbours.",
            },
            20 * 24 * 60 * 60 * 1000,
        ),
    ];

    return [...tags, ...tagTitles, ...articles, ...noise];
}

function startRecommendations(profile: AffinityProfile) {
    affinityProfile.value = profile;
    const scope = effectScope();
    let result: ReturnType<typeof useRecommendations> | undefined;
    scope.run(() => {
        result = useRecommendations();
    });
    if (!result) throw new Error("useRecommendations did not initialize inside its effect scope");
    return { scope, result };
}

describe("useRecommendations offline relevance", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.luminaryInternals.delete("corpusStats");
        localStorage.clear();
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        appLanguageIdsAsRef.value = [LANGUAGE_ID];
        appSyncedLanguageIdsAsRef.value = [LANGUAGE_ID];
        await db.docs.bulkPut(buildCorpus());
        await recomputeCorpusStats();
    });

    it("surfaces a clear majority of prayer content for a prayer enthusiast", async () => {
        const { scope, result } = startRecommendations({
            affinity: { [TAGS.prayer]: 0.85 },
            lastDecayUtc: Date.now(),
        });

        try {
            await waitForExpect(
                () => {
                    expect(result.recommended.value.length).toBeGreaterThanOrEqual(5);
                    const topFive = result.recommended.value.slice(0, 5);
                    expect(
                        topFive.filter((doc) => doc.parentTags.includes(TAGS.prayer)).length,
                    ).toBeGreaterThanOrEqual(3);
                    // This doc cannot come from the Mango tag leg, so its presence proves
                    // the tag-title content resolved and drove a real local BM25 search.
                    expect(result.recommended.value.map((doc) => doc._id)).toContain(
                        `content-untagged-prayer-vocabulary-${LANGUAGE_ID}`,
                    );
                },
                WAIT_TIMEOUT_MS,
            );
        } finally {
            scope.stop();
        }
    });

    it("surfaces a clear majority of politics content for a politics reader", async () => {
        const { scope, result } = startRecommendations({
            affinity: { [TAGS.politics]: 0.8 },
            lastDecayUtc: Date.now(),
        });

        try {
            await waitForExpect(
                () => {
                    expect(result.recommended.value.length).toBeGreaterThanOrEqual(5);
                    const topFive = result.recommended.value.slice(0, 5);
                    expect(
                        topFive.filter((doc) => doc.parentTags.includes(TAGS.politics)).length,
                    ).toBeGreaterThanOrEqual(3);
                },
                WAIT_TIMEOUT_MS,
            );
        } finally {
            scope.stop();
        }
    });

    it("keeps a diffuse reader's recommendations spread across multiple clusters", async () => {
        const { scope, result } = startRecommendations({
            affinity: {
                [TAGS.prayer]: 0.4,
                [TAGS.politics]: 0.4,
                [TAGS.health]: 0.4,
            },
            lastDecayUtc: Date.now(),
        });

        try {
            await waitForExpect(
                () => {
                    const representedClusters = new Set(
                        (Object.keys(TAGS) as Cluster[]).filter((cluster) =>
                            result.recommended.value.some((doc) =>
                                doc.parentTags.includes(TAGS[cluster]),
                            ),
                        ),
                    );
                    expect(result.recommended.value).not.toHaveLength(0);
                    expect(representedClusters.size).toBeGreaterThanOrEqual(2);
                },
                WAIT_TIMEOUT_MS,
            );
        } finally {
            scope.stop();
        }
    });

    it("returns no recommendations for a cold profile", async () => {
        const { scope, result } = startRecommendations({
            affinity: {},
            lastDecayUtc: undefined,
        });

        try {
            await waitForExpect(
                () => {
                    expect(result.recommended.value).toEqual([]);
                },
                WAIT_TIMEOUT_MS,
            );
        } finally {
            scope.stop();
        }
    });
});
