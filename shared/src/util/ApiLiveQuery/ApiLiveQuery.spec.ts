import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick, ref } from "vue";
import { ApiLiveQuery } from "./ApiLiveQuery";
import { getRest } from "../../rest/RestApi";
import { getSocket, isConnected } from "../../socket/socketio";
import { BaseDocumentDto, DocType } from "../../types";
import waitForExpect from "wait-for-expect";

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
        expect(liveQuery.liveData.value).toEqual(mockDocs);
        expect(liveQuery.liveItem.value).toEqual(mockDocs[0]);
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
            expect(liveQuery.liveData.value).toEqual(initialValue);
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
            expect(liveQuery.liveData.value).toEqual(mockDocs1);
        });

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValueOnce({ docs: mockDocs2 }),
        } as any);

        query.value = { types: [DocType.Tag] }; // Update the query to trigger a new search

        await waitForExpect(() => {
            expect(liveQuery.liveData.value).toEqual(mockDocs2);
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
            expect(liveQuery.liveData.value).toEqual(mockDocs);
        });
    });

    it("isLoading is true while fetching and false after data is loaded", async () => {
        const query = ref({ types: [DocType.Post] });
        let resolveSearch: (value: any) => void;
        const searchPromise = new Promise((resolve) => {
            resolveSearch = resolve;
        });

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockReturnValue(searchPromise),
        } as any);

        const liveQuery = new ApiLiveQuery(query, {});

        // isLoading should be true while waiting for search to resolve
        expect(liveQuery.isLoading.value).toBe(true);

        // Resolve the search promise to simulate data loaded
        resolveSearch!({ docs: [{ _id: "1", type: DocType.Post }] });

        await waitForExpect(() => {
            expect(liveQuery.isLoading.value).toBe(false);
        });
    });

    it("isLoading is false if not connected", async () => {
        isConnected.value = false;
        const query = ref({ types: [DocType.Post] });

        const liveQuery = new ApiLiveQuery(query, {});

        await waitForExpect(() => {
            expect(liveQuery.isLoading.value).toBe(false);
        });

        isConnected.value = true; // restore for other tests
    });
});
