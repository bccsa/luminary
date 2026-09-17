import { describe, expect, it, vi } from "vitest";
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { ResultWindow } from "./resultWindow";

const doc = (id: string, publishDate: number, time = 1) =>
    ({ _id: id, updatedTimeUtc: time, type: "content", publishDate }) as BaseDocumentDto;

const page1 = {
    selector: { type: "content" },
    $sort: [{ publishDate: "desc" }],
    $limit: 2,
} as MangoQuery;
const page2 = { ...page1, $limit: 4 } as MangoQuery;

function window() {
    const publish = vi.fn();
    return {
        publish,
        window: new ResultWindow<BaseDocumentDto>({
            publish,
            touchLocal: vi.fn(),
            validateDelete: () => true,
        }),
    };
}

it("widen() adopts the new limit and re-publishes from the contributions it already holds", () => {
    const { window: w, publish } = window();
    w.reset(page1, false);
    w.setLocal([doc("a", 300), doc("b", 200)], false);
    w.setRemote([doc("c", 100)]);
    expect(publish).toHaveBeenLastCalledWith([doc("a", 300), doc("b", 200)]);

    w.widen(page2);
    // No source was re-read: the third doc was already held, just outside the limit.
    expect(publish).toHaveBeenLastCalledWith([doc("a", 300), doc("b", 200), doc("c", 100)]);
});

it("reset() remains all-or-nothing, so the two are not interchangeable", () => {
    const { window: w, publish } = window();
    w.reset(page1, false);
    w.setLocal([doc("a", 300)], false);
    w.setRemote([doc("c", 100)]);

    w.reset(page2, /* keepPrevious */ true);
    w.setLocal([], false);
    expect(publish).toHaveBeenLastCalledWith([]);
});

it("setRemote accumulates across slices — page-over-page union", () => {
    const { window: w, publish } = window();
    w.reset({ ...page1, $limit: 10 } as MangoQuery, false);
    w.setLocal([doc("a", 300)], false);
    w.setRemote([doc("b", 200)]);
    w.setRemote([doc("c", 100)]);
    expect(publish).toHaveBeenLastCalledWith([doc("a", 300), doc("b", 200), doc("c", 100)]);
    expect(w.remoteDocs).toEqual([doc("b", 200), doc("c", 100)]);
});

describe("fetchedRemoteDocs", () => {
    it("only includes docs a setRemote call actually returned", () => {
        const { window: w } = window();
        w.reset({ ...page1, $limit: 10 } as MangoQuery, false);
        w.setRemote([doc("b", 200)]);
        expect(w.fetchedRemoteDocs).toEqual([doc("b", 200)]);
    });

    it("excludes a doc a live socket upsert merged into the remote contribution", () => {
        const { window: w } = window();
        w.reset({ ...page1, $limit: 10 } as MangoQuery, false);
        w.setRemote([doc("b", 200)]);
        // A socket upsert for a doc that was never part of any page's fetch result —
        // e.g. an old doc edited so it now matches the query.
        w.applySocketData(
            { docs: [doc("pushed", 1)] } as any,
            () => true,
            () => false,
        );
        expect(w.remoteDocs).toEqual([doc("b", 200), doc("pushed", 1)]);
        expect(w.fetchedRemoteDocs).toEqual([doc("b", 200)]);
    });

    it("is cleared on reset()", () => {
        const { window: w } = window();
        w.reset({ ...page1, $limit: 10 } as MangoQuery, false);
        w.setRemote([doc("b", 200)]);
        w.reset({ ...page1, $limit: 10 } as MangoQuery, false);
        expect(w.fetchedRemoteDocs).toEqual([]);
    });
});
