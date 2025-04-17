import { computed, Ref, ref, watch } from "vue";
import { ApiSearchQuery, getRest } from "../rest/RestApi";
import { getSocket, isConnected } from "../socket/socketio";
import {
    ApiQueryResult,
    BaseDocumentDto,
    ContentDto,
    DeleteCmdDto,
    DocType,
    RedirectDto,
} from "../types";
import { db } from "../db/database";

export type ApiLiveQueryOptions<T> = {
    initialValue?: T;
};

/**
 * ApiLiveQuery is a wrapper around the REST API and socket.io to provide a live query
 * functionality. It allows you to subscribe to a query and get live updates when the data
 * changes. It uses Vue's reactivity system to provide a reactive API.
 * @param query The query to subscribe to. It should be a valid ApiSearchQuery object.
 * @param options Options for the live query. It can contain an initial value for the data.
 * @returns A Vue ref that contains the data from the query. The data will be updated
 * automatically when the data changes in the database.
 */
export class ApiLiveQuery<T extends BaseDocumentDto> {
    private dataAsRef: Ref<Array<T> | undefined>;
    private socketOnCallback: ((data: ApiQueryResult<T>) => void) | undefined = undefined;
    private unwatch;
    private isLoading = ref(true);

    /**
     * Get the live query data as a Vue ref array
     */
    public toArrayAsRef() {
        return this.dataAsRef;
    }

    /**
     * Get the live query data as a Vue ref object. If multiple items are available, only the first one is returned.
     */
    public toRef() {
        return computed(() => {
            if (!this.dataAsRef.value || !this.dataAsRef.value.length) return undefined;
            return this.dataAsRef.value[0];
        });
    }

    /**
     * A Vue ref that indicates if the live query is loading data. It will be true when the data is being fetched from the API.
     */
    public isLoadingAsRef() {
        return this.isLoading;
    }

    constructor(query: Ref<ApiSearchQuery>, options?: ApiLiveQueryOptions<Array<T>>) {
        // Validate the query
        if (query.value.groups) {
            throw new Error("groups are not supported in ApiLiveQuery");
        }

        if (query.value.queryString) {
            throw new Error("queryString is not implemented yet");
        }

        this.dataAsRef = ref<Array<T> | undefined>(options?.initialValue) as Ref<
            Array<T> | undefined
        >;

        // Fetch initial data from the REST API and subscribe to live updates
        this.unwatch = watch(
            [query, isConnected],
            () => {
                this.unsubscribeLiveData();

                if (!isConnected.value) {
                    this.isLoading.value = false;
                    return;
                }

                this.isLoading.value = true;

                getRest()
                    .search(query.value)
                    .then((result) => {
                        this.dataAsRef.value = result.docs as Array<T>;
                    })
                    .catch((error) => {
                        console.error("Error fetching data from API:", error);
                    })
                    .finally(() => {
                        this.isLoading.value = false;
                    });

                // Listen for updates from the socket
                this.socketOnCallback = (data) =>
                    applySocketData<T>(data, this.dataAsRef, query.value);
                getSocket().on("data", this.socketOnCallback);
            },
            { immediate: true },
        );
    }

    /**
     * Stop listening for live updates from the API. After stopLiveQuery is called, the data will not be updated anymore.
     */
    stopLiveQuery() {
        this.unsubscribeLiveData();
        if (this.unwatch) this.unwatch();
    }

    /**
     * Stop listening for live updates
     */
    private unsubscribeLiveData() {
        if (this.socketOnCallback) getSocket().off("data", this.socketOnCallback);
        this.socketOnCallback = undefined;
    }
}

/**
 * Apply an array of items to an array by _id. If the item already exists in the array, it will be updated.
 */
function updateArray<T extends BaseDocumentDto>(array: Array<T>, items: Array<T>) {
    items.forEach((item) => {
        const index = array.findIndex((i) => i._id === item._id);
        if (index !== -1) {
            array[index] = item;
        } else {
            array.push(item);
        }
    });
}

/**
 * Apply the data from the socket to the destination array after filtering it based on the query.
 */
export function applySocketData<T extends BaseDocumentDto>(
    data: ApiQueryResult<T>,
    destination: Ref<Array<T> | undefined>,
    query: ApiSearchQuery,
) {
    // Delete documents that are marked for deletion
    const toDeleteIds = (data.docs as unknown as Array<DeleteCmdDto>)
        .filter((doc) => {
            if (doc.type !== DocType.DeleteCmd) return false;

            return db.validateDeleteCommand(doc);
        })
        .map((doc) => doc.docId);

    destination.value = destination.value?.filter(
        (doc) => !toDeleteIds.includes(doc._id),
    ) as Array<T>;

    // Filter out delete commands from the result
    let docs = data.docs.filter((doc) => doc.type !== DocType.DeleteCmd);

    // Filter on document type
    if (query.types && query.types.length > 0) {
        if (
            query.contentOnly &&
            (query.types.includes(DocType.Post) || query.types.includes(DocType.Tag))
        ) {
            docs = docs.filter(
                (doc) =>
                    doc.type === DocType.Content &&
                    doc.parentType &&
                    query.types?.includes(doc.parentType),
            );
        } else {
            docs = docs.filter(
                (doc) =>
                    query.types?.includes(doc.type) ||
                    (doc.type === DocType.Content &&
                        doc.parentType &&
                        query.types?.includes(doc.parentType)),
            );
        }
    }

    // Filter on language
    if (query.languages && query.languages.length > 0) {
        docs = docs.filter(
            (doc) =>
                doc.type !== DocType.Content ||
                query.languages?.includes((doc as unknown as ContentDto).language),
        );
    }

    if (query.from) docs = docs.filter((doc) => doc.updatedTimeUtc >= query.from!);
    if (query.to) docs = docs.filter((doc) => doc.updatedTimeUtc <= query.to!);
    if (query.docId) docs = docs.filter((doc) => doc._id === query.docId);
    if (query.slug) {
        docs = docs.filter((doc) => {
            const typedDoc = doc as unknown as RedirectDto | ContentDto;
            return typedDoc.slug === query.slug;
        });
    }

    // If limit or offset is set, only update already existing documents
    if (query.limit || query.offset) {
        docs = docs.filter((doc) => destination.value?.some((d) => d._id === doc._id));
    }

    // Update the ref
    if (docs.length && !destination.value) {
        destination.value = docs;
    } else {
        updateArray(destination.value, docs);
    }

    // Sorting
    if (!query.sort || !query.sort.length) {
        // Default to updatedTimeUtc descending order if no sort is provided
        destination.value.sort((a, b) => {
            return b.updatedTimeUtc - a.updatedTimeUtc;
        });

        return;
    }

    query.sort.forEach((sort) => {
        const key = Object.keys(sort)[0];
        const order = sort[key];

        if (!destination.value) return;
        destination.value.sort((a, b) => {
            const _a = a as any;
            const _b = b as any;

            if (!_a[key] || !_b[key]) return 0; // Skip if key is not present

            if (order === "asc") {
                if (_a[key] < _b[key]) return -1;
                if (_a[key] > _b[key]) return 1;
            } else {
                if (_a[key] < _b[key]) return 1;
                if (_a[key] > _b[key]) return -1;
            }

            return 0;
        });
    });
}
