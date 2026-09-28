# Off-main-thread tasks

A small typed RPC over one reusable Web Worker. Register a job in `tasks.ts` and call it with
`runInWorker(name, payload)`; it runs off the main thread when it can and on the main thread when
it can't, with the same implementation either way.

```ts
const results = await runInWorker("ftsSearch", { query, languageId });
```

## What already routes

Callers do not opt in — the library routes at its own boundary, so these are off the main thread
with no change at the call site:

| Work                 | Entry point                                                 | Task                         |
| -------------------- | ----------------------------------------------------------- | ---------------------------- |
| Full-text search     | `ftsSearch`, `ftsSearchMany`, and so `useFtsSearch`         | `ftsSearch`, `ftsSearchMany` |
| Corpus-stats scan    | `recomputeCorpusStats` (the write stays on the main thread) | `corpusScan`                 |
| One-shot local reads | `queryLocal`, `HybridQuery` without `live`                  | `mangoQuery`                 |
| Live local reads     | `HybridQuery` with `live`, when `liveQueriesInWorker` is on | `mangoQuery` (subscribed)    |

`SharedConfig.liveQueriesInWorker` is off by default; until it is on, live `HybridQuery` reads run
in a `liveQuery` on the main thread.

## Adding a task

One entry in `tasks.ts` is the whole of it:

```ts
export const workerTasks = {
    myTask: {
        needsDb: true, // open the database before running
        run: (payload: MyPayload) => doWork(payload),
        trim: (result: MyResult) => smaller(result), // optional, see "Payload size" below
    } satisfies WorkerTask<MyPayload, MyResult>,
};
```

`runInWorker` then types `myTask`'s payload and result from that entry. `run` is also the
main-thread fallback, so a task must not depend on being in a worker.

Import implementations from their own module rather than from `../index`: the worker bundles
whatever `tasks.ts` reaches, and the package barrel pulls in the socket, REST and Vue layers.

## Live tasks

A task marked `live: true` can also be kept live:

```ts
const stop = subscribeInWorker("mangoQuery", query, { next: (docs) => render(docs) });
```

The worker runs the task under its own `liveQuery`. Dexie broadcasts every committed write to
the other realms on the origin over a `BroadcastChannel`, with the key ranges it touched, so a
write from the main thread re-runs only the worker queries that it affects. No write path has to
publish anything. Every emission is cloned back whole, so `trim` matters more here than for a
one-shot task.

Subscriptions sit outside the worker's serial queue and do not count as load when a worker is
picked. If the worker fails, crashes or is released, the subscription moves to a `liveQuery` on
the main thread and stays there for the rest of its life. `error` fires only for a failure on the
main thread, which then retries after 100ms.

## What a task may do

The worker is a separate realm. It has its own module instances, its own Dexie connection, and
no DOM.

- **No Vue reactivity crosses the boundary.** `liveQuery`, `useDexieLiveQuery`, `HybridQuery`,
  `accessMap`, `isConnected` are main-thread only. Tasks are one-shot request/response.
- **Reads, not writes.** `openDatabaseInWorker` (`../db/database.ts`) attaches to the database as
  it already is, because `initDatabase` reads the schema version from `localStorage` and so
  cannot run here. Writing would mean solving schema-version negotiation first. A task that
  produces something to store returns it and lets the caller write — `corpusScan` does this.
- **Nothing a task reaches may import the worker client.** `tasks.ts` is the root of the worker
  bundle, so an implementation that imports `workerClient` pulls the pool into the worker it is
  meant to drive. Where a module on that path needs to route work out (`ftsIndexer`), it takes
  an injected runner instead; `luminary.ts` supplies the worker-backed one.
- **A live query runs its `liveQuery` here, never on the caller's thread.** `liveQuery` re-runs by
  observing what the querier touched in Dexie's zone on its own thread. Wrapping a worker call in
  a main-thread `liveQuery` touches nothing there, so it emits once and then goes silently stale.
  Use `subscribeInWorker` instead (see "Live tasks").
- **Payloads are structured-cloned**, so they must be plain data. Refs, class instances and
  functions do not survive.
- **Config is a snapshot**, sent once when the worker starts. `appLanguageIdsAsRef` is not in it.

## Why the policy is in the layer

These rules decide whether a worker helps or hurts on a low-end device, so they live here rather
than in each caller:

- **Workers are reused, never spawned per call.** Startup is ~40ms plus an IndexedDB open, and a
  warm worker keeps its module caches (the FTS index-key and document-frequency caches). `init()`
  warms the pool during idle time once the database is open (set `SharedConfig.useWorkers` to
  `false` to opt out, or call `warmWorkers()` yourself); there is deliberately no idle timeout,
  because respawning costs more than an idle worker does.
- **The pool is capped at two, and below the core count.** Budget devices report many weak cores,
  so the constant is the real protection. A second worker appears only when the first is busy.
- **Payload size is a first-class concern.** Structured cloning is the one cost a worker adds and
  it is paid on both threads. `trim` exists to drop anything the caller won't read before the
  result is cloned back.
- **Measure before routing more.** `measureQueryCost(query)` times a read on the main thread
  against the same read through the worker, plus the clone of its result, on the device that
  matters. The main thread reads a worker result for about the cost of one deserialize of the
  result. Reading it itself costs a deserialize of every record the index scan touched, plus the
  filter. The worker loses only when those two are close: an index that already narrows the
  scan to about the result, and a large result.
- **Superseded work is dropped.** The worker drains a serial queue and skips requests cancelled
  before they were dequeued, so a burst where most calls are superseded costs one run. Pass an
  `AbortSignal` to `runInWorker`, or let `useWorkerTask` do it for you.

## `useWorkerTask`

The Vue surface: re-runs on payload change, discards results from superseded runs, and abandons
in-flight work when the payload changes or the scope is disposed.

```ts
const { data, isRunning, error, run, cancel } = useWorkerTask("ftsSearch", optionsRef, {
    debounceMs: 300,
});
```

## Failure behaviour

Degrading to the main thread is always correct, never an error the caller sees:

| Situation                                   | Result                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| No `Worker` (prerender, jsdom, old browser) | Runs on the main thread                                               |
| Worker fails to construct or load           | Pool is disabled for the session; pending work reruns here            |
| A task throws in the worker                 | That one call reruns here; the database reopens for the next task     |
| Signal aborted                              | Rejects with `WorkerTaskAborted`; the worker drops the queued request |

A database upgrade in another realm closes the worker's connection — the failing task reports it,
and the next one reopens.

## Consumers whose bundler can't resolve the worker

The entry is loaded with `new Worker(new URL("./luminary.worker.ts", import.meta.url))`, which
needs a bundler that understands that idiom. Where it doesn't, worker construction fails and
everything runs on the main thread. To supply an entry instead:

```ts
configureWorkerPool({ createWorker: () => new MyBundlersWorker() });
```
