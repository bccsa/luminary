import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { effectScope } from "vue";
import waitForExpect from "wait-for-expect";
import {
    db,
    DocType,
    PublishStatus,
    TagType,
    type AffinityMap,
    type ContentDto,
} from "luminary-shared";
import { appLanguageIdsAsRef, appSyncedLanguageIdsAsRef } from "@/globalConfig";
import { affinityProfile } from "@/recommendation/affinityStore";
import { globalAffinity } from "@/recommendation/globalAffinityStore";
import { useCommunityRecommendations } from "./useCommunityRecommendations";

const LANGUAGE_ID = "lang-eng";
const MEMBER_OF = ["group-public-content"];
const DAY_MS = 24 * 60 * 60 * 1000;
const WAIT_TIMEOUT_MS = 15_000;

const TAGS = { prayer: "tag-prayer", politics: "tag-politics" } as const;

function makeTagContent(tagId: string, title: string): ContentDto {
    return {
        _id: `content-${tagId}`,
        type: DocType.Content,
        parentType: DocType.Tag,
        parentId: tagId,
        parentTagType: TagType.Topic,
        updatedTimeUtc: 0,
        memberOf: MEMBER_OF,
        parentTags: [],
        language: LANGUAGE_ID,
        status: PublishStatus.Published,
        publishDate: 1,
        slug: tagId,
        title,
    } as ContentDto;
}

function makeArticle(id: string, tags: string[], ageDays: number): ContentDto {
    return {
        _id: `content-${id}`,
        type: DocType.Content,
        parentType: DocType.Post,
        parentId: `post-${id}`,
        updatedTimeUtc: 0,
        memberOf: MEMBER_OF,
        parentTags: tags,
        language: LANGUAGE_ID,
        status: PublishStatus.Published,
        publishDate: Date.now() - ageDays * DAY_MS,
        slug: id,
        title: id,
        summary: id,
        text: id,
    } as ContentDto;
}

function buildCorpus(): ContentDto[] {
    const articles: ContentDto[] = [];
    for (let i = 0; i < 6; i++) articles.push(makeArticle(`prayer-${i}`, [TAGS.prayer], 10 + i));
    for (let i = 0; i < 6; i++)
        articles.push(makeArticle(`politics-${i}`, [TAGS.politics], 10 + i));
    return [
        makeTagContent(TAGS.prayer, "Prayer"),
        makeTagContent(TAGS.politics, "Politics"),
        ...articles,
    ];
}

function start(global: AffinityMap) {
    globalAffinity.value = global;
    const scope = effectScope();
    let result: ReturnType<typeof useCommunityRecommendations> | undefined;
    scope.run(() => {
        result = useCommunityRecommendations();
    });
    if (!result) throw new Error("composable did not initialize inside its effect scope");
    return { scope, result };
}

describe("useCommunityRecommendations", () => {
    beforeEach(async () => {
        await db.docs.clear();
        localStorage.clear();
        globalAffinity.value = {};
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        appLanguageIdsAsRef.value = [LANGUAGE_ID];
        appSyncedLanguageIdsAsRef.value = [LANGUAGE_ID];
        await db.docs.bulkPut(buildCorpus());
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("stays empty while the aggregate has nothing in it", async () => {
        const { scope, result } = start({});
        try {
            await waitForExpect(() => {
                expect(result.ready.value).toBe(true);
            }, WAIT_TIMEOUT_MS);
            expect(result.recommended.value).toHaveLength(0);
        } finally {
            scope.stop();
        }
    });

    it("surfaces content for the topics the audience engages with", async () => {
        const { scope, result } = start({ [TAGS.prayer]: 0.4 });
        try {
            await waitForExpect(() => {
                expect(result.recommended.value.length).toBeGreaterThan(0);
            }, WAIT_TIMEOUT_MS);
            for (const doc of result.recommended.value) {
                expect(doc.parentTags).toContain(TAGS.prayer);
            }
        } finally {
            scope.stop();
        }
    });

    it("favours the stronger community topic", async () => {
        const { scope, result } = start({ [TAGS.prayer]: 0.4, [TAGS.politics]: 0.01 });
        try {
            await waitForExpect(() => {
                expect(result.recommended.value.length).toBeGreaterThan(3);
            }, WAIT_TIMEOUT_MS);
            const prayerCount = result.recommended.value.filter((d) =>
                d.parentTags?.includes(TAGS.prayer),
            ).length;
            expect(prayerCount).toBeGreaterThan(result.recommended.value.length / 2);
        } finally {
            scope.stop();
        }
    });

    it("ranks the same way whatever the aggregate's absolute scale is", async () => {
        // Global scores grow with adoption; the ordering must not drift as they do.
        const early = start({ [TAGS.prayer]: 0.004, [TAGS.politics]: 0.001 });
        let earlyOrder: string[] = [];
        try {
            await waitForExpect(() => {
                expect(early.result.recommended.value.length).toBeGreaterThan(3);
            }, WAIT_TIMEOUT_MS);
            earlyOrder = early.result.recommended.value.map((d) => d._id);
        } finally {
            early.scope.stop();
        }

        const mature = start({ [TAGS.prayer]: 0.8, [TAGS.politics]: 0.2 });
        try {
            await waitForExpect(() => {
                expect(mature.result.recommended.value.length).toBeGreaterThan(3);
            }, WAIT_TIMEOUT_MS);
            expect(mature.result.recommended.value.map((d) => d._id)).toEqual(earlyOrder);
        } finally {
            mature.scope.stop();
        }
    });

    it("never writes to the personal profile", async () => {
        const { scope, result } = start({ [TAGS.prayer]: 0.4 });
        try {
            await waitForExpect(() => {
                expect(result.recommended.value.length).toBeGreaterThan(0);
            }, WAIT_TIMEOUT_MS);
            expect(affinityProfile.value.affinity).toEqual({});
            expect(localStorage.getItem("globalAffinityContribution")).toBeNull();
        } finally {
            scope.stop();
        }
    });
});
