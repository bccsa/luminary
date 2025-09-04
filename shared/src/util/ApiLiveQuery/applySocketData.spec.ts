import { describe, it, expect, vi, afterEach } from "vitest";
import { ref } from "vue";
import { ApiSearchQuery } from "../../rest/RestApi";
import {
    ApiQueryResult,
    BaseDocumentDto,
    ContentDto,
    DeleteCmdDto,
    DocType,
    RedirectDto,
} from "../../types";
import { db } from "../../db/database";
import { applySocketData } from "./applySocketData";

vi.mock("../../rest/RestApi", () => {
    return {
        getRest: vi.fn(() => ({
            search: vi.fn(),
        })),
    };
});

const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
};

vi.mock("../../socket/socketio", () => {
    return {
        getSocket: vi.fn(() => mockSocket),
        isConnected: ref(true),
    };
});

vi.mock("../../db/database", () => {
    return {
        db: {
            validateDeleteCommand: vi.fn(),
        },
    };
});

describe("applySocketData", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("removes documents marked for deletion", () => {
        const destination = ref<BaseDocumentDto[]>([
            { _id: "1", type: DocType.Post } as BaseDocumentDto,
            { _id: "2", type: DocType.Tag } as BaseDocumentDto,
        ]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [{ _id: "1", type: DocType.DeleteCmd, docId: "1" } as DeleteCmdDto],
        };

        vi.mocked(db.validateDeleteCommand).mockReturnValue(true);

        applySocketData(data, destination, {});

        expect(destination.value).toEqual([{ _id: "2", type: DocType.Tag }]);
    });

    it("filters out delete commands from the result", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.DeleteCmd, docId: "1" } as DeleteCmdDto,
                { _id: "2", type: DocType.Post } as BaseDocumentDto,
            ],
        };

        applySocketData(data, destination, {});

        expect(destination.value).toEqual([{ _id: "2", type: DocType.Post }]);
    });

    it("filters documents by type", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post } as BaseDocumentDto,
                { _id: "2", type: DocType.Tag } as BaseDocumentDto,
            ],
        };

        const query = { types: [DocType.Post] };

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([{ _id: "1", type: DocType.Post }]);
    });

    it("filters documents by language", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Content, language: "en" } as ContentDto,
                { _id: "2", type: DocType.Content, language: "fr" } as ContentDto,
            ],
        };

        const query = { languages: ["en"] };

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([{ _id: "1", type: DocType.Content, language: "en" }]);
    });

    it("filters documents by date range", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
                { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
            ],
        };

        const query = { from: 1500, to: 2500 };

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([{ _id: "2", type: DocType.Post, updatedTimeUtc: 2000 }]);
    });

    it("filters documents by docId", () => {
        const destination = ref<BaseDocumentDto[]>([]);
        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post } as BaseDocumentDto,
                { _id: "2", type: DocType.Tag } as BaseDocumentDto,
            ],
        };
        const query = { docId: "1" };

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([{ _id: "1", type: DocType.Post }]);
    });

    it("filters documents by slug", () => {
        const destination = ref<ContentDto[] | RedirectDto[]>([]);
        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post, slug: "test" } as ContentDto,
                { _id: "2", type: DocType.Tag, slug: "test" } as RedirectDto,
                { _id: "3", type: DocType.Tag, slug: "test-tag" } as ContentDto,
            ],
        };
        const query = { slug: "test" };

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([
            { _id: "1", type: DocType.Post, slug: "test" },
            { _id: "2", type: DocType.Tag, slug: "test" },
        ]);
    });

    it("updates existing documents in the destination array", () => {
        const destination = ref<BaseDocumentDto[]>([
            { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
        ]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [{ _id: "1", type: DocType.Post, updatedTimeUtc: 2000 }],
        };

        applySocketData(data, destination, {});

        expect(destination.value).toEqual([{ _id: "1", type: DocType.Post, updatedTimeUtc: 2000 }]);
    });

    it("sorts documents by updatedTimeUtc in ascending order", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
                { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
            ],
        };

        const query = { sort: [{ updatedTimeUtc: "asc" }] } as ApiSearchQuery;

        applySocketData(data, destination, query);

        expect(destination.value).toEqual([
            { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
            { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
        ]);
    });

    it("sorts documents by updatedTimeUtc in descending order by default", () => {
        const destination = ref<BaseDocumentDto[]>([]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
                { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
            ],
        };

        applySocketData(data, destination, {});

        expect(destination.value).toEqual([
            { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
            { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
        ]);
    });

    it("only updates existing documents if limit or offset is set", () => {
        const destination = ref<BaseDocumentDto[]>([
            { _id: "1", type: DocType.Post, updatedTimeUtc: 1000 },
            { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
        ]);

        const data: ApiQueryResult<BaseDocumentDto> = {
            docs: [
                { _id: "1", type: DocType.Post, updatedTimeUtc: 3000 },
                { _id: "3", type: DocType.Post, updatedTimeUtc: 4000 },
            ],
        };

        const query = { limit: 1, offset: 0 } as ApiSearchQuery;
        applySocketData(data, destination, query);

        expect(destination.value).toEqual([
            { _id: "1", type: DocType.Post, updatedTimeUtc: 3000 },
            { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
        ]);
    });
});
