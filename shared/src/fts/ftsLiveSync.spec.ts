import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ref, shallowRef } = require("vue");
    const socketDataHandlers = new Set<(data: any) => void>();
    const socketMock = {
        on: (event: string, cb: (data: any) => void) => {
            if (event === "data") socketDataHandlers.add(cb);
        },
        off: (event: string, cb: (data: any) => void) => {
            if (event === "data") socketDataHandlers.delete(cb);
        },
    };
    const liveRefs: Array<{ ref: { value: any }; querier: any; options: any }> = [];
    return {
        isConnected: ref(true) as { value: boolean },
        getSocketMock: vi.fn(() => socketMock),
        socketDataHandlers,
        emitSocket: (docs: any[]) => {
            for (const h of [...socketDataHandlers]) h({ docs });
        },
        validateDeleteCommandMock: vi.fn(() => true),
        whereAnyOf: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
        liveRefs,
        useDexieLiveQueryMock: vi.fn((querier: any, options: any) => {
            const r = shallowRef(options?.initialValue);
            liveRefs.push({ ref: r, querier, options });
            return r;
        }),
    };
});

vi.mock("../socket/socketio", () => ({
    isConnected: mocks.isConnected,
    getSocket: mocks.getSocketMock,
}));

vi.mock("../db/database", () => ({
    db: {
        docs: {
            where: () => ({ anyOf: mocks.whereAnyOf }),
        },
        validateDeleteCommand: mocks.validateDeleteCommandMock,
    },
}));

vi.mock("../util/useDexieLiveQuery/useDexieLiveQuery", () => ({
    useDexieLiveQuery: mocks.useDexieLiveQueryMock,
}));

import { effectScope, ref, nextTick } from "vue";
import { attachFtsLiveSync } from "./ftsLiveSync";
import { DocType } from "../types";

describe("attachFtsLiveSync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.socketDataHandlers.clear();
        mocks.liveRefs.length = 0;
        mocks.isConnected.value = true;
        mocks.validateDeleteCommandMock.mockReturnValue(true);
    });

    it("removes a result when a matching DeleteCmd arrives on the socket", () => {
        const scope = effectScope();
        const results = ref([{ _id: "u1", name: "Ada" }, { _id: "u2", name: "Bob" }]);

        scope.run(() =>
            attachFtsLiveSync(
                results,
                { getId: (d) => d._id, patch: (d, live) => ({ ...d, ...live }) },
                { docType: DocType.User },
            ),
        );

        mocks.emitSocket([
            {
                _id: "del-1",
                type: DocType.DeleteCmd,
                docType: DocType.User,
                docId: "u1",
            },
        ]);

        expect(results.value).toEqual([{ _id: "u2", name: "Bob" }]);
        scope.stop();
    });

    it("ignores DeleteCmds that fail validateDeleteCommand", () => {
        mocks.validateDeleteCommandMock.mockReturnValue(false);
        const scope = effectScope();
        const results = ref([{ _id: "u1", name: "Ada" }]);

        scope.run(() =>
            attachFtsLiveSync(
                results,
                { getId: (d) => d._id, patch: (d, live) => ({ ...d, ...live }) },
                { docType: DocType.User },
            ),
        );

        mocks.emitSocket([
            {
                _id: "del-1",
                type: DocType.DeleteCmd,
                docType: DocType.User,
                docId: "u1",
            },
        ]);

        expect(results.value).toHaveLength(1);
        scope.stop();
    });

    it("removes a result when a deleteReq upsert arrives", () => {
        const scope = effectScope();
        const results = ref([{ _id: "r1", slug: "old" }]);

        scope.run(() =>
            attachFtsLiveSync(
                results,
                { getId: (d) => d._id, patch: (d, live) => ({ ...d, ...live }) },
                { docType: DocType.Redirect },
            ),
        );

        mocks.emitSocket([{ _id: "r1", type: DocType.Redirect, deleteReq: 1 }]);

        expect(results.value).toEqual([]);
        scope.stop();
    });

    it("patches a result when a non-delete upsert arrives", () => {
        const scope = effectScope();
        const results = ref([{ _id: "u1", name: "Ada" }]);

        scope.run(() =>
            attachFtsLiveSync(
                results,
                { getId: (d) => d._id, patch: (d, live) => ({ ...d, ...live }) },
                { docType: DocType.User },
            ),
        );

        mocks.emitSocket([{ _id: "u1", type: DocType.User, name: "Ada Lovelace" }]);

        expect(results.value[0]).toMatchObject({ _id: "u1", name: "Ada Lovelace" });
        scope.stop();
    });

    it("prunes results when Dexie no longer holds the doc (watchDexie)", async () => {
        const scope = effectScope();
        const results = ref([
            { docId: "c1", doc: { _id: "c1", title: "One" } },
            { docId: "c2", doc: { _id: "c2", title: "Two" } },
        ]);

        scope.run(() =>
            attachFtsLiveSync(
                results,
                {
                    getId: (r) => r.docId,
                    patch: (r, live) => ({ ...r, doc: live as any }),
                },
                { docType: DocType.Content, watchDexie: true },
            ),
        );

        expect(mocks.liveRefs).toHaveLength(1);
        mocks.liveRefs[0]!.ref.value = [{ _id: "c2", title: "Two updated" }];
        await nextTick();

        expect(results.value).toEqual([
            { docId: "c2", doc: { _id: "c2", title: "Two updated" } },
        ]);
        scope.stop();
    });
});
