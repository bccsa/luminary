import { describe, it, expect, beforeEach } from "vitest";
import { ref } from "vue";
import { isSyncableDoc } from "./isSyncable";
import { initConfig, config } from "../config";
import { DocType, type BaseDocumentDto } from "../types";

const doc = (over: Partial<BaseDocumentDto>): BaseDocumentDto =>
    ({ _id: "x", type: DocType.Post, updatedTimeUtc: 1, ...over }) as BaseDocumentDto;

describe("isSyncableDoc", () => {
    beforeEach(() => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "", syncList: [] });
    });

    it("always allows DeleteCmd, regardless of syncList", () => {
        config.syncList = [];
        expect(isSyncableDoc(doc({ type: DocType.DeleteCmd }))).toBe(true);
    });

    it("allows a doc whose type matches a sync:true, non-contentOnly entry", () => {
        config.syncList = [{ type: DocType.Post, contentOnly: false, sync: true }];
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(true);
    });

    it("blocks a type whose syncList entry is sync:false (the PII gate)", () => {
        config.syncList = [{ type: DocType.User, sync: false }];
        expect(isSyncableDoc(doc({ type: DocType.User }))).toBe(false);
    });

    it("blocks a type not present in syncList", () => {
        config.syncList = [{ type: DocType.Post, sync: true }];
        expect(isSyncableDoc(doc({ type: DocType.User }))).toBe(false);
    });

    it("does not match content by a contentOnly parent entry on the type rule", () => {
        // contentOnly entry must NOT allow a Post doc through the type rule.
        config.syncList = [{ type: DocType.Post, contentOnly: true, sync: true }];
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(false);
    });

    it("allows content by parentType when no language filter is set", () => {
        config.syncList = [{ type: DocType.Post, contentOnly: true, sync: true }];
        config.appLanguageIdsAsRef = ref([]);
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(true);
    });

    it("filters content by active language when a filter is set", () => {
        config.syncList = [{ type: DocType.Post, contentOnly: true, sync: true }];
        config.appLanguageIdsAsRef = ref(["lang-en"]);
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

    it("allows content by parentType when appLanguageIdsAsRef is undefined (no filter ref)", () => {
        config.syncList = [{ type: DocType.Post, contentOnly: true, sync: true }];
        config.appLanguageIdsAsRef = undefined;
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(true);
    });

    it("blocks content with no language when a language filter is set", () => {
        config.syncList = [{ type: DocType.Post, contentOnly: true, sync: true }];
        config.appLanguageIdsAsRef = ref(["lang-en"]);
        // doc.language is undefined, so the langs.includes() check can never pass.
        expect(isSyncableDoc(doc({ type: DocType.Content, parentType: DocType.Post }))).toBe(false);
    });

    it("blocks content whose parentType matches no syncList entry", () => {
        config.syncList = [{ type: DocType.Tag, contentOnly: true, sync: true }];
        config.appLanguageIdsAsRef = ref([]);
        expect(
            isSyncableDoc(
                doc({ type: DocType.Content, parentType: DocType.Post, language: "lang-en" }),
            ),
        ).toBe(false);
    });

    it("returns false when syncList is undefined", () => {
        config.syncList = undefined;
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(false);
    });

    it("treats a syncList entry with no sync field as sync:true (initConfig default)", () => {
        // initConfig defaults sync -> true when undefined, so the type rule applies.
        initConfig({
            cms: false,
            docsIndex: "",
            apiUrl: "",
            syncList: [{ type: DocType.Post }],
        });
        expect(config.syncList![0].sync).toBe(true);
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(true);
    });

    it("treats a syncList entry with no contentOnly field as contentOnly:false (initConfig default)", () => {
        // initConfig defaults contentOnly -> false, so the type rule matches the parent type doc.
        initConfig({
            cms: false,
            docsIndex: "",
            apiUrl: "",
            syncList: [{ type: DocType.Post }],
        });
        expect(config.syncList![0].contentOnly).toBe(false);
        expect(isSyncableDoc(doc({ type: DocType.Post }))).toBe(true);
    });
});
