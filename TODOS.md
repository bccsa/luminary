# TODOs

- Hook up the transferred SSG/ISR watcher, polling, and deployment workflow completely in the deployment project.

## Simplifications for the migrated watcher (now in the deploy repo)

Found during a review of this repo before `watch.ts` / `watchPoll.ts` moved out. Line numbers are the pre-move ones; apply only if the code still looks like this over there.

- `watch.ts:74–122` — `loadManifest` / `loadRouteIndex` / `loadRedirectIndex` / `loadDocFacets` are byte-identical apart from path + fallback. Collapse into one `loadJson<T>(path, fallback)` (try `JSON.parse(readFileSync(...))`, catch → fallback). Leave the four `saveX` alone — they're two different shapes.
- `watch.ts:216–254` — `applyContentDeletes` / `applyRouteDeletes` share the delete tail (delete from manifest, `rmSync(contentFile(route))`, `pruneRouteIndex`, save both). Extractable, but it's ~6 lines and `applyContentDeletes` adds parent tracking — modest payoff.
- `watchPoll.ts:81` — `if (!page.length) return docs;` is subsumed by the `if (page.length < limit) return docs;` two lines below. Removable; arguably reads as an explicit "no more pages" guard, so it's a judgment call.
