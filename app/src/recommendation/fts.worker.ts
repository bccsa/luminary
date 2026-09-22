import { ftsSearch, openDatabaseForFtsWorker } from "luminary-shared";
import type { FtsWorkerRequest, FtsWorkerResponse } from "./ftsWorkerClient";

let ready: Promise<void> | undefined;

self.onmessage = async (event: MessageEvent<FtsWorkerRequest>) => {
    const { id, options } = event.data;
    let response: FtsWorkerResponse;
    try {
        ready ??= openDatabaseForFtsWorker();
        await ready;
        response = { id, results: await ftsSearch(options) };
    } catch (error) {
        // Reopen on the next search: an upgrade in the app closes this connection.
        ready = undefined;
        response = { id, error: String(error) };
    }
    self.postMessage(response);
};
