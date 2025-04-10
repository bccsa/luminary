import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { ApiLiveQuery, applySocketData } from "./ApiLiveQuery";
import { ApiSearchQuery, getRest } from "../rest/RestApi";
import { getSocket, isConnected } from "../socket/socketio";
import { ApiQueryResult, BaseDocumentDto, ContentDto, DeleteCmdDto, DocType } from "../types";
import waitForExpect from "wait-for-expect";
import { db } from "../db/database";

vi.mock("../rest/RestApi", () => {
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

vi.mock("../socket/socketio", () => {
    return {
        getSocket: vi.fn(() => mockSocket),
        isConnected: ref(true),
    };
});

vi.mock("../db/database", () => {
    return {
        db: {
            validateDeleteCommand: vi.fn(),
        },
    };
});

describe("ApiLiveQuery", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("throws an error if query contains 'groups'", () => {
        const query = ref({ groups: ["group1"] });
        expect(() => new ApiLiveQuery(query, {})).toThrowError(
            "groups are not supported in ApiLiveQuery",
        );
    });

    it("throws an error if query contains 'queryString'", () => {
        const query = ref({ queryString: "test" });
        expect(() => new ApiLiveQuery(query, {})).toThrowError(
            "queryString is not implemented yet",
        );
    });

    it("fetches initial data from the REST API", async () => {
        isConnected.value = true;
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post }];

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
        } as any);

        const liveQuery = new ApiLiveQuery(query, {});

        await waitForExpect(() => {
            expect(getRest().search).toHaveBeenCalledWith(query.value);
        });
        expect(liveQuery.toArrayAsRef().value).toEqual(mockDocs);
        expect(liveQuery.toRef().value).toEqual(mockDocs[0]);
    });

    it("subscribes to socket updates", async () => {
        const query = ref({ types: [DocType.Post] });
        new ApiLiveQuery(query, {});

        await waitForExpect(() => {
            expect(getSocket().on).toHaveBeenCalled();
            expect(getSocket().on).toHaveBeenCalledWith("data", expect.any(Function));
        });
    });

    it("unsubscribes from previous socket updates when query changes", async () => {
        const query = ref({ types: [DocType.Post] });
        new ApiLiveQuery(query, {});

        await waitForExpect(() => {
            expect(getSocket().on).toHaveBeenCalled();
        });

        // Change the query to trigger a new subscription
        query.value = { types: [DocType.Tag] };

        await waitForExpect(() => {
            expect(getSocket().off).toHaveBeenCalled();
            expect(getSocket().off).toHaveBeenCalledWith("data", expect.any(Function));
        });
    });

    it("stops listening for live updates when stopLiveQuery is called", async () => {
        const query = ref({ types: [DocType.Post] });
        const liveQuery = new ApiLiveQuery(query, {});
        liveQuery.stopLiveQuery();
        await waitForExpect(() => {
            expect(getSocket().off).toHaveBeenCalledWith("data", expect.any(Function));
        });
    });

    it("sets initial value if provided", async () => {
        const query = ref({ types: [DocType.Post] });
        const initialValue = [{ _id: "1", type: DocType.Post } as BaseDocumentDto];

        const liveQuery = new ApiLiveQuery(query, { initialValue });

        await waitForExpect(() => {
            expect(liveQuery.toArrayAsRef().value).toEqual(initialValue);
        });
    });

    // This test is breaking other tests, so we are having it at the bottom for now
    it("updates data when query changes", async () => {
        const query = ref({ types: [DocType.Post] });
        const mockDocs1 = [{ _id: "1", type: DocType.Post }];
        const mockDocs2 = [{ _id: "2", type: DocType.Tag }];

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValueOnce({ docs: mockDocs1 }),
        } as any);

        const liveQuery = new ApiLiveQuery(query, {});

        await waitForExpect(() => {
            expect(liveQuery.toArrayAsRef().value).toEqual(mockDocs1);
        });

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValueOnce({ docs: mockDocs2 }),
        } as any);

        query.value = { types: [DocType.Tag] }; // Update the query to trigger a new search

        await waitForExpect(() => {
            expect(liveQuery.toArrayAsRef().value).toEqual(mockDocs2);
        });
    });

    it("re-queries the API when the connection is restored", async () => {
        // This test might not be fully testing the reconnection logic
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post }];

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
        } as any);

        isConnected.value = false; // Simulate disconnection

        const liveQuery = new ApiLiveQuery(query, {});

        await nextTick();
        expect(getRest().search).not.toHaveBeenCalled();

        isConnected.value = true; // Simulate reconnection
        await nextTick();

        await waitForExpect(() => {
            expect(getRest().search).toHaveBeenCalledWith(query.value);
            expect(liveQuery.toArrayAsRef().value).toEqual(mockDocs);
        });
    });

    describe("applySocketData", () => {
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

            expect(destination.value).toEqual([
                { _id: "1", type: DocType.Content, language: "en" },
            ]);
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

            expect(destination.value).toEqual([
                { _id: "2", type: DocType.Post, updatedTimeUtc: 2000 },
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

            expect(destination.value).toEqual([
                { _id: "1", type: DocType.Post, updatedTimeUtc: 2000 },
            ]);
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
});
