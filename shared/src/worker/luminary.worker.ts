import { createWorkerHost } from "./workerHost";
import type { WorkerMessage, WorkerResponse } from "./types";

// No tsconfig here includes the WebWorker lib, so `self` resolves to the DOM `Window`, whose
// `postMessage` overloads are not the worker's. Narrowing it keeps the protocol type-checked.
const scope = self as unknown as {
    postMessage: (response: WorkerResponse) => void;
    onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
};

const handle = createWorkerHost((response) => scope.postMessage(response));

scope.onmessage = (event) => handle(event.data);
