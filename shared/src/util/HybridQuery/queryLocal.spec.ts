import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, expect } from "vitest";

// Real db (fake-indexeddb) + real mangoToDexie — queryLocal is the thin, awaitable,
// local-only read primitive that backs imperative/boot-time callers (e.g. auth.ts).
import { db, initDatabase } from "../../db/database";
import { initConfig } from "../../config";
import { queryLocal } from "./HybridQuery";
import { DocType, type BaseDocumentDto, type AuthProviderDto } from "../../types";

const provider = (_id: string, clientId: string): BaseDocumentDto =>
    ({
        _id,
        type: DocType.AuthProvider,
        clientId,
        memberOf: ["g1"],
        updatedTimeUtc: 1,
    }) as unknown as BaseDocumentDto;

describe("queryLocal — awaitable local-only IndexedDB read", () => {
    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "clientId",
            apiUrl: "http://localhost:12345",
        });
        await initDatabase();
    });

    beforeEach(async () => {
        await db.docs.clear();
    });

    it("resolves the documents matching the selector", async () => {
        await db.docs.bulkPut([provider("ap-1", "client-a"), provider("ap-2", "client-b")]);

        const res = await queryLocal<AuthProviderDto>({ selector: { type: DocType.AuthProvider } });

        expect(res.map((d) => d._id).sort()).toEqual(["ap-1", "ap-2"]);
    });

    it("resolves an empty array when nothing matches — the case the change-gated reactive output can't signal", async () => {
        // Store has docs, but none of the requested type.
        await db.docs.bulkPut([
            { _id: "lang", type: DocType.Language, memberOf: [], updatedTimeUtc: 1 } as BaseDocumentDto,
        ]);

        const res = await queryLocal<AuthProviderDto>({ selector: { type: DocType.AuthProvider } });

        expect(res).toEqual([]);
    });

    it("resolves (never rejects) on an empty store", async () => {
        const res = await queryLocal<AuthProviderDto>({ selector: { type: DocType.AuthProvider } });
        expect(res).toEqual([]);
    });
});
