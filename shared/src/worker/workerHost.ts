import { liveQuery, type Subscription } from "dexie";
import { initConfig } from "../config";
import { openDatabaseInWorker } from "../db/database";
import { workerTasks } from "./tasks";
import type {
    WorkerMessage,
    WorkerResponse,
    WorkerRunMessage,
    WorkerSubscribeMessage,
    WorkerTask,
} from "./types";

type AnyTask = WorkerTask<unknown, unknown>;

/**
 * Worker-thread half of the RPC. Requests are drained one at a time rather than handled
 * concurrently in `onmessage`: a device with one spare core gains nothing from interleaving
 * them, and a serial queue lets a superseded request be dropped before it costs anything.
 */
export function createWorkerHost(post: (response: WorkerResponse) => void) {
    const queue: WorkerRunMessage[] = [];
    const cancelled = new Set<number>();
    // `null` while the database is still opening, so an unsubscribe that lands first can stop
    // the subscription from ever starting.
    const subscriptions = new Map<number, Subscription | null>();
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

    async function openDbWithRetry(): Promise<void> {
        try {
            await openDb();
        } catch {
            // Worth exactly one retry: a connection dropped by a schema upgrade, or a warm-up
            // that ran before the database existed, must not poison this task.
            await openDb();
        }
    }

    // Dispatch is dynamic from here: the registry's precise per-task typing is enforced at the
    // `runInWorker` / `subscribeInWorker` call sites instead.
    function lookup(name: string): AnyTask | undefined {
        return workerTasks[name as keyof typeof workerTasks] as unknown as AnyTask | undefined;
    }

    async function run(request: WorkerRunMessage): Promise<WorkerResponse> {
        const task = lookup(request.task);
        if (!task)
            return { id: request.id, ok: false, error: `Unknown worker task: ${request.task}` };
        try {
            if (task.needsDb) await openDbWithRetry();
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

    /**
     * Keep a task live here. Dexie broadcasts every committed write to the other realms on the
     * origin, so the main thread's writes re-trigger this `liveQuery` without a bridge of our
     * own. It bypasses the serial queue: a subscription idles between writes, and queueing it
     * would stall every one-shot request behind it.
     */
    async function subscribe(request: WorkerSubscribeMessage) {
        const { id } = request;
        const task = lookup(request.task);
        if (!task?.live) {
            post({ id, ok: false, error: `Not a live worker task: ${request.task}` });
            return;
        }
        subscriptions.set(id, null);
        try {
            if (task.needsDb) await openDbWithRetry();
        } catch (error) {
            if (subscriptions.delete(id)) post({ id, ok: false, error: String(error) });
            return;
        }
        if (!subscriptions.has(id)) return;

        const subscription = liveQuery(() => task.run(request.payload)).subscribe({
            next: (result) =>
                post({ id, ok: true, result: task.trim ? task.trim(result) : result }),
            error: (error) => {
                subscriptions.delete(id);
                dbReady = undefined;
                post({ id, ok: false, error: String(error) });
            },
        });
        if (subscriptions.has(id)) subscriptions.set(id, subscription);
        else subscription.unsubscribe();
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
                return;
            case "subscribe":
                void subscribe(message);
                return;
            case "unsubscribe":
                subscriptions.get(message.id)?.unsubscribe();
                subscriptions.delete(message.id);
        }
    };
}
