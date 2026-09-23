import { initConfig } from "../config";
import { openDatabaseInWorker } from "../db/database";
import { workerTasks } from "./tasks";
import type { WorkerMessage, WorkerResponse, WorkerRunMessage, WorkerTask } from "./types";

type AnyTask = WorkerTask<unknown, unknown>;

/**
 * Worker-thread half of the RPC. Requests are drained one at a time rather than handled
 * concurrently in `onmessage`: a device with one spare core gains nothing from interleaving
 * them, and a serial queue lets a superseded request be dropped before it costs anything.
 */
export function createWorkerHost(post: (response: WorkerResponse) => void) {
    const queue: WorkerRunMessage[] = [];
    const cancelled = new Set<number>();
    let draining = false;
    let dbReady: Promise<void> | undefined;

    function openDb(): Promise<void> {
        dbReady ??= openDatabaseInWorker().catch((error) => {
            // Retry on the next task rather than wedging the worker — the database may not
            // exist yet when a caller warms this worker itself, ahead of `init()`.
            dbReady = undefined;
            throw error;
        });
        return dbReady;
    }

    async function run(request: WorkerRunMessage): Promise<WorkerResponse> {
        // Dispatch is dynamic from here: the registry's precise per-task typing is enforced at
        // the `runInWorker` call site instead.
        const task = workerTasks[request.task as keyof typeof workerTasks] as unknown as
            | AnyTask
            | undefined;
        if (!task)
            return { id: request.id, ok: false, error: `Unknown worker task: ${request.task}` };
        try {
            if (task.needsDb) {
                try {
                    await openDb();
                } catch {
                    // Worth exactly one retry: a connection dropped by a schema upgrade, or a
                    // warm-up that ran before the database existed, must not poison this task.
                    await openDb();
                }
            }
            const result = await task.run(request.payload);
            return { id: request.id, ok: true, result: task.trim ? task.trim(result) : result };
        } catch (error) {
            // Reopen on the next task: an upgrade in the app closes this connection.
            dbReady = undefined;
            return { id: request.id, ok: false, error: String(error) };
        }
    }

    async function drain() {
        if (draining) return;
        draining = true;
        try {
            for (let request = queue.shift(); request; request = queue.shift()) {
                if (cancelled.delete(request.id)) continue;
                post(await run(request));
            }
        } finally {
            draining = false;
        }
    }

    return function handle(message: WorkerMessage) {
        switch (message.kind) {
            case "init":
                if (message.config) initConfig(message.config);
                // Pay the connection cost now, while the main thread is still idle.
                void openDb().catch(() => undefined);
                return;
            case "cancel":
                cancelled.add(message.id);
                return;
            case "run":
                queue.push(message);
                void drain();
        }
    };
}
