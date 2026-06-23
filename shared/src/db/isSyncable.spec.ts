import { describe, it, expect, beforeEach } from "vitest";
import { isSyncableDoc } from "./isSyncable";
import { syncList } from "../api/sync/state";
import type { SyncListEntry } from "../api/sync/types";
import { DocType, type BaseDocumentDto } from "../types";

const doc = (over: Partial<BaseDocumentDto>): BaseDocumentDto =>
    ({ _id: "x", type: DocType.Post, updatedTimeUtc: 1, ...over }) as BaseDocumentDto;

const entry = (over: Partial<SyncListEntry> & { chunkType: string }): SyncListEntry => ({
    memberOf: ["group-a"],
    blockStart: 1,
    blockEnd: 0,
    ...over,
});

describe("isSyncableDoc", () => {
    beforeEach(() => {
        syncList.value = [];
    });

    it("always allows DeleteCmd, regardless of syncList", () => {
        syncList.value = [];
        expect(isSyncableDoc(doc({ type: DocType.DeleteCmd }))).toBe(true);
    });

    it("allows a doc whose type matches a (non-content) syncList entry", () => {
        syncList.value = [entry({ chunkType: DocType.Post })];
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(true);
    });

    it("blocks a type not present in syncList", () => {
        syncList.value = [entry({ chunkType: DocType.Post })];
        expect(isSyncableDoc(doc({ type: DocType.User }))).toBe(false);
    });

    it("blocks everything (except DeleteCmd) when syncList is empty", () => {
        syncList.value = [];
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(false);
    });

    it("does NOT match a parent-type doc by a content chunk entry", () => {
        // A `content:post` entry must not let a Post doc through — only its Content children.
        syncList.value = [entry({ chunkType: `${DocType.Content}:${DocType.Post}` })];
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(false);
    });

    it("allows content by parentType when the entry pins no languages", () => {
        syncList.value = [entry({ chunkType: `${DocType.Content}:${DocType.Post}` })];
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(true);
    });

    it("filters content by the entry's languages when set", () => {
        syncList.value = [
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["lang-en"] }),
        ];
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(true);
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-fr" }),
            ),
        ).toBe(false);
    });

    it("blocks content whose parentType matches no syncList entry", () => {
        syncList.value = [entry({ chunkType: `${DocType.Content}:${DocType.Tag}` })];
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(false);
    });

    it("ignores memberOf — the server scopes the feed by room, not the gate", () => {
        // Entry tracks group-a; a doc in group-z still passes the type gate.
        syncList.value = [entry({ chunkType: DocType.Post, memberOf: ["group-a"] })];
        expect(isSyncableDoc(doc({ type: DocType.Post, memberOf: ["group-z"] }))).toBe(true);
    });

    it("rebuilds the predicate when the subscription signature changes", () => {
        syncList.value = [
            entry({ chunkType: `${DocType.Content}:${DocType.Post}`, languages: ["lang-en"] }),
        ];
        expect(
            isSyncableDoc(doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-fr" })),
        ).toBe(false);

        // Add French to the synced languages → French content now passes.
        syncList.value = [
            entry({
                chunkType: `${DocType.Content}:${DocType.Post}`,
                languages: ["lang-en", "lang-fr"],
            }),
        ];
        expect(
            isSyncableDoc(doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-fr" })),
        ).toBe(true);
    });
});
