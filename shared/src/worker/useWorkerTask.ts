import { getCurrentScope, onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { runInWorker, WorkerTaskAborted } from "./workerClient";
import type { WorkerTaskName, WorkerTasks } from "./tasks";
import type { WorkerTaskPayload, WorkerTaskResult } from "./types";

export type UseWorkerTaskOptions = {
    /** Wait this long after a payload change before running. 0 runs on the next tick. */
    debounceMs?: number;
    /** Ignore payload changes and only run when `run()` is called. */
    manual?: boolean;
};

export type UseWorkerTaskReturn<R> = {
    data: Ref<R | undefined>;
    isRunning: Ref<boolean>;
    error: Ref<unknown>;
    /** Run now, dropping any debounced or in-flight run. */
    run: () => void;
    /** Abandon the in-flight run and any debounced one. Leaves `data` alone. */
    cancel: () => void;
};

/**
 * Vue wrapper around {@link runInWorker}: re-runs when the payload changes, discards results from
 * superseded runs, and abandons in-flight work when the payload changes or the scope is disposed
 * — so a user who keeps typing or navigates away doesn't leave the worker scoring dead queries.
 */
export function useWorkerTask<K extends WorkerTaskName>(
    task: K,
    payload: Ref<WorkerTaskPayload<WorkerTasks[K]> | undefined>,
    options: UseWorkerTaskOptions = {},
): UseWorkerTaskReturn<WorkerTaskResult<WorkerTasks[K]>> {
    type Result = WorkerTaskResult<WorkerTasks[K]>;
    const { debounceMs = 0, manual = false } = options;

    const data = shallowRef(undefined) as Ref<Result | undefined>;
    const isRunning = ref(false);
    const error = shallowRef<unknown>(undefined) as Ref<unknown>;

    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | undefined;

    function cancel() {
        generation++;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = undefined;
        inFlight?.abort();
        inFlight = undefined;
        isRunning.value = false;
    }

    async function start() {
        const current = payload.value;
        if (current === undefined) return;

        const thisRun = ++generation;
        const controller = new AbortController();
        inFlight = controller;
        isRunning.value = true;
        try {
            const result = await runInWorker(task, current, { signal: controller.signal });
            if (thisRun !== generation) return;
            data.value = result as Result;
            error.value = undefined;
        } catch (e) {
            if (thisRun !== generation || e instanceof WorkerTaskAborted) return;
            error.value = e;
        } finally {
            if (thisRun === generation) {
                isRunning.value = false;
                inFlight = undefined;
            }
        }
    }

    function run() {
        cancel();
        void start();
    }

    function schedule() {
        cancel();
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            void start();
        }, debounceMs);
    }

    if (!manual) watch(payload, schedule, { deep: true, immediate: true });
    if (getCurrentScope()) onScopeDispose(cancel);

    return { data, isRunning, error, run, cancel };
}
