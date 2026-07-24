import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import waitForExpect from "wait-for-expect";
import * as shared from "luminary-shared";
import {
    db,
    DocType,
    PublishStatus,
    type AffinityProfile,
    type ContentDto,
    type FtsSearchResult,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { affinityProfile } from "@/recommendation/affinityStore";
import { sessionNow } from "@/util/sessionNow";
import { useMoreLikeThis, type UseMoreLikeThisOptions } from "./useMoreLikeThis";

const LANGUAGE_ID = "lang-eng";
const TOPIC_A = "tag-topic-a";
const TOPIC_B = "tag-topic-b";

function makeContent(
    id: string,
    parentTags: string[] = [],
    overrides: Partial<ContentDto> = {},
): ContentDto {
    return {
        _id: id,
        type: DocType.Content,
        parentType: DocType.Post,
        parentId: `post-${id}`,
        updatedTimeUtc: Date.now(),
        memberOf: ["group-public-content"],
        parentTags,
        language: LANGUAGE_ID,
        status: PublishStatus.Published,
        slug: id,
        title: id,
        summary: `Summary for ${id}`,
        publishDate: Date.now() - 1_000,
        ...overrides,
    } as ContentDto;
}

function makeSeedTag(parentId: string): ContentDto {
    return makeContent(`content-${parentId}`, [], {
        parentType: DocType.Tag,
        parentId,
        title: parentId,
    });
}

function makeFtsResult(doc: ContentDto): FtsSearchResult {
    return { docId: doc._id, score: 1, wordMatchScore: 1, doc };
}

function startMoreLikeThis(
    selectedContent: ContentDto | undefined,
    seedTags: ContentDto[],
    options?: UseMoreLikeThisOptions,
) {
    const scope = effectScope();
    const result = scope.run(() =>
        useMoreLikeThis(
            () => selectedContent,
            () => seedTags,
            options,
        ),
    );
    if (!result) throw new Error("useMoreLikeThis did not initialize inside its effect scope");
    return { result, scope };
}

describe("useMoreLikeThis", () => {
    let previousLanguageIds: string[];
    let previousAffinity: AffinityProfile;
    const scopes: ReturnType<typeof effectScope>[] = [];

    beforeEach(async () => {
        previousLanguageIds = [...appLanguageIdsAsRef.value];
        previousAffinity = affinityProfile.value;
        appLanguageIdsAsRef.value = [LANGUAGE_ID];
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        localStorage.clear();
        await db.docs.clear();
        await db.setLuminaryInternals("highlights", undefined);
        vi.spyOn(shared, "ftsSearch").mockResolvedValue([]);
    });

    afterEach(async () => {
        scopes.splice(0).forEach((scope) => scope.stop());
        vi.restoreAllMocks();
        affinityProfile.value = previousAffinity;
        appLanguageIdsAsRef.value = previousLanguageIds;
        await db.docs.clear();
        await db.setLuminaryInternals("highlights", undefined);
    });

    function start(
        selectedContent: ContentDto | undefined,
        seedTags: ContentDto[],
        options?: UseMoreLikeThisOptions,
    ) {
        const started = startMoreLikeThis(selectedContent, seedTags, options);
        scopes.push(started.scope);
        return started.result;
    }

    it("retrieves a candidate that shares one of the selected article's topic tags", async () => {
        const selected = makeContent("selected", [TOPIC_A]);
        const candidate = makeContent("shared-topic", [TOPIC_A]);
        await db.docs.put(candidate);

        const result = start(selected, [makeSeedTag(TOPIC_A)]);

        await waitForExpect(() => {
            expect(result.similar.value.map((doc) => doc._id)).toContain(candidate._id);
        });
    });

    it("excludes the selected article from both retrieval legs", async () => {
        const selected = makeContent("selected", [TOPIC_A]);
        await db.docs.put(selected);
        vi.mocked(shared.ftsSearch).mockResolvedValue([makeFtsResult(selected)]);

        const result = start(selected, [makeSeedTag(TOPIC_A)]);

        await waitForExpect(() => expect(shared.ftsSearch).toHaveBeenCalled());
        await waitForExpect(() => expect(result.similar.value).toEqual([]));
    });

    it("excludes candidate with the same parentId as selected article even if _id differs", async () => {
        const selected = makeContent("selected", [TOPIC_A]);
        const selectedTranslation = makeContent("selected-spanish", [TOPIC_A], {
            parentId: selected.parentId,
            language: "lang-spa",
        });
        await db.docs.put(selectedTranslation);
        vi.mocked(shared.ftsSearch).mockResolvedValue([makeFtsResult(selectedTranslation)]);

        const result = start(selected, [makeSeedTag(TOPIC_A)]);

        await waitForExpect(() => expect(shared.ftsSearch).toHaveBeenCalled());
        await waitForExpect(() => expect(result.similar.value).toEqual([]));
    });

    it("includes an FTS-only title match with no shared topic tag", async () => {
        const selected = makeContent("selected", [TOPIC_A], {
            title: "A distinctive shared phrase",
            summary: "More seed vocabulary",
        });
        const ftsOnly = makeContent("fts-only", ["tag-unrelated"]);
        vi.mocked(shared.ftsSearch).mockResolvedValue([makeFtsResult(ftsOnly)]);

        const result = start(selected, [makeSeedTag(TOPIC_A)]);

        await waitForExpect(() => {
            expect(result.similar.value.map((doc) => doc._id)).toContain(ftsOnly._id);
        });
        expect(shared.ftsSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                query: "A distinctive shared phrase More seed vocabulary",
                languageId: LANGUAGE_ID,
                status: PublishStatus.Published,
            }),
        );
    });

    it("uses the viewer's affinity to reorder equally topical candidates by their own tags", async () => {
        const selected = makeContent("selected", [TOPIC_A, TOPIC_B]);
        const neutralCandidate = makeContent("neutral", [TOPIC_A]);
        const personalizedCandidate = makeContent("personalized", [TOPIC_B]);
        await db.docs.bulkPut([neutralCandidate, personalizedCandidate]);
        affinityProfile.value = {
            affinity: { [TOPIC_B]: 0.9 },
            lastDecayUtc: sessionNow(),
        };

        const result = start(selected, [makeSeedTag(TOPIC_A), makeSeedTag(TOPIC_B)]);

        await waitForExpect(() => {
            expect(result.similar.value.map((doc) => doc._id)).toEqual([
                personalizedCandidate._id,
                neutralCandidate._id,
            ]);
        });
    });

    it("also searches the article's own saved highlight text and surfaces a match found only there", async () => {
        const selected = makeContent("selected", [TOPIC_A], {
            title: "A distinctive shared phrase",
            summary: "More seed vocabulary",
        });
        const titleMatch = makeContent("title-match");
        const highlightOnlyMatch = makeContent("highlight-only-match");
        await db.setLuminaryInternals("highlights", {
            [selected._id]: {
                html: "<p><mark>Specific highlighted vocabulary</mark></p>",
                updatedAt: Date.now(),
            },
        });
        vi.mocked(shared.ftsSearch).mockImplementation(async ({ query }) =>
            query === "Specific highlighted vocabulary"
                ? [makeFtsResult(highlightOnlyMatch)]
                : [makeFtsResult(titleMatch)],
        );

        const result = start(selected, [makeSeedTag(TOPIC_A)]);

        await waitForExpect(() => {
            expect(shared.ftsSearch).toHaveBeenCalledWith(
                expect.objectContaining({ query: "Specific highlighted vocabulary" }),
            );
            expect(result.similar.value.map((doc) => doc._id)).toEqual(
                expect.arrayContaining([titleMatch._id, highlightOnlyMatch._id]),
            );
        });
    });

    it("handles an empty seed-tag list without crashing", async () => {
        const selected = makeContent("selected");

        const result = start(selected, []);

        await waitForExpect(() => expect(shared.ftsSearch).toHaveBeenCalled());
        expect(result.similar.value).toEqual([]);
    });
});
