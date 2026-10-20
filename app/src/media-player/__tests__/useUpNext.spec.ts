import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";

const upNextDocs = vi.hoisted(() => ({ value: [] as any[] }));
const categoryDocs = vi.hoisted(() => ({ value: [] as any[] }));
const tagDocs = vi.hoisted(() => ({ value: [] as any[] }));
vi.mock("@/composables/useContentQuery", async () => {
    const { computed } = await import("vue");
    return {
        // Two queries ask for tag documents: the categories (a series) and all of the tags.
        useContentQuery: (selector: () => unknown[]) =>
            computed(() => {
                const text = JSON.stringify(selector());
                if (!text.includes('"parentType"')) return upNextDocs.value;
                return text.includes('"parentTagType"') ? categoryDocs.value : tagDocs.value;
            }),
    };
});

import { useUpNext } from "../useUpNext";

const doc = (id: string, publishDate: number, parentTags: string[], video = "https://cdn.example.com/x.m3u8") =>
    ({
        ...mockEnglishContentDto,
        _id: id,
        parentId: `${id}-parent`,
        title: id,
        publishDate,
        parentTags,
        video,
    }) as unknown as ContentDto;

const tag = (id: string, title: string) =>
    ({ ...mockEnglishContentDto, _id: `tag-${id}`, parentId: id, title }) as unknown as ContentDto;

/** Playing the Friday of a conference: the Thursday before it, the Saturday and Sunday after it. */
function playingFriday(tags = ["conf", "topic"]) {
    const playing = doc("friday", 100, tags);
    categoryDocs.value = [tag("conf", "Conference")];
    tagDocs.value = [tag("conf", "Conference"), tag("topic", "Topic")];
    upNextDocs.value = [
        playing,
        doc("sunday", 300, ["conf"]),
        doc("thursday", 50, ["conf"]),
        doc("other-topic", 400, ["topic"]),
        doc("saturday", 200, ["conf"]),
    ];
    return playing;
}

beforeEach(() => {
    upNextDocs.value = [];
    categoryDocs.value = [];
    tagDocs.value = [];
});

describe("useUpNext", () => {
    it("offers nothing when nothing plays", () => {
        const result = useUpNext(ref(undefined)).value;
        expect(result).toEqual({ series: [], next: [], related: [], tags: [] });
    });

    it("lists the whole series in date order, the playing one in it", () => {
        const playing = playingFriday();
        const { series } = useUpNext(ref(playing)).value;
        expect(series.map((d) => d._id)).toEqual(["thursday", "friday", "saturday", "sunday"]);
    });

    it("offers what comes after the playing one as next, and the rest as related", () => {
        const playing = playingFriday();
        const { next, related } = useUpNext(ref(playing)).value;
        expect(next.map((d) => d._id)).toEqual(["saturday", "sunday"]);
        expect(related.map((d) => d._id)).toEqual(["other-topic"]);
    });

    it("leaves out posts that have no media", () => {
        const playing = playingFriday();
        const silent = { ...doc("silent", 250, ["conf"], ""), parentMedia: undefined } as unknown as ContentDto;
        upNextDocs.value = [...upNextDocs.value, silent];
        const { series } = useUpNext(ref(playing)).value;
        expect(series.map((d) => d._id)).not.toContain("silent");
    });

    it("has no series for a post that is the only one of its category", () => {
        const playing = doc("alone", 100, ["conf"]);
        categoryDocs.value = [tag("conf", "Conference")];
        upNextDocs.value = [playing];
        expect(useUpNext(ref(playing)).value.series).toEqual([]);
    });

    it("names the tags with the series first", () => {
        const playing = playingFriday(["topic", "conf"]);
        const { tags } = useUpNext(ref(playing)).value;
        expect(tags.map((t) => [t.id, t.series])).toEqual([
            ["conf", true],
            ["topic", false],
        ]);
    });

    it("narrows to a series: its whole run, and nothing from other tags", () => {
        const playing = playingFriday();
        const result = useUpNext(ref(playing), ref("conf")).value;
        expect(result.series.map((d) => d._id)).toEqual(["thursday", "friday", "saturday", "sunday"]);
        expect(result.related.map((d) => d._id)).not.toContain("other-topic");
    });

    it("narrows to a topic: no series and no next, only what has the topic", () => {
        const playing = playingFriday();
        upNextDocs.value = [playing, doc("other-topic", 400, ["topic"]), doc("outside", 10, ["conf"])];
        const result = useUpNext(ref(playing), ref("topic")).value;
        expect(result.series).toEqual([]);
        expect(result.next).toEqual([]);
        expect(result.related.map((d) => d._id)).toEqual(["other-topic"]);
    });
});
