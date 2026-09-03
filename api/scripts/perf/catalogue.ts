import { PerfContext } from "./lib/context";

export type CatalogueEntry = {
    id: string;
    group: string;
    label: string;
    method: "POST" | "GET";
    path: string;
    body?: any;
    /**
     * Client-shaped Mango query handed to CouchDB `_explain`. This is the query BEFORE
     * the API injects permission/status/language clauses, so it answers "would this
     * shape find an index at all" — the executed cost comes from `execution_stats`.
     */
    explain?: any;
    /** Set for entries that are expected to be rejected; the reject path is timed too. */
    expectStatus?: number;
    /** Needs CmsView. Under an identity without it a 403 is the correct answer, not a failure. */
    requiresCmsView?: boolean;
    /**
     * Where this shape comes from. A hand-written approximation is worse than useless — it
     * measures a query nothing sends and reports the result as a finding — so every entry
     * names the call site it mirrors, or says it is synthetic.
     */
    source: string;
};

const DAY = 86_400_000;
const SYNC_LIMIT = 100;

/**
 * Every request shape the API serves, built from documents the audit identity can
 * actually see. Sync entries mirror `shared/src/api/sync/syncBatch.ts`; hybrid entries
 * mirror `shared/src/util/HybridQuery`.
 */
export function buildCatalogue(ctx: PerfContext): CatalogueEntry[] {
    const now = Date.now();
    const groups = ctx.contentGroups.length ? ctx.contentGroups : ctx.groups;
    const langs = ctx.languages.slice(0, 3);
    const entries: CatalogueEntry[] = [];

    /**
     * The sync columns the clients actually run, copied from `app/src/sync.ts` and
     * `cms/src/sync.ts`. Doc types absent here are never synced — the app runs no
     * Post/Tag/Group columns of its own, and nothing syncs User at all.
     */
    type SyncColumn = {
        type: string;
        subType?: string;
        limit: number;
        /** CMS content columns pass includeDeleteCmds:false — the parent column covers them. */
        deleteCmds?: boolean;
    };

    const APP_SYNC: SyncColumn[] = [
        { type: "authProvider", limit: 100 },
        { type: "language", limit: 100 },
        { type: "content", subType: "post", limit: 100 },
        { type: "content", subType: "tag", limit: 100 },
        { type: "redirect", limit: 100 },
        { type: "storage", limit: 100 },
        { type: "defaultAffinity", limit: 1 },
    ];

    const CMS_SYNC: SyncColumn[] = [
        { type: "authProvider", limit: 100 },
        { type: "language", limit: 100 },
        { type: "post", limit: 500 },
        { type: "content", subType: "post", limit: 100, deleteCmds: false },
        { type: "tag", limit: 500 },
        { type: "content", subType: "tag", limit: 100, deleteCmds: false },
        { type: "redirect", limit: 500 },
        { type: "group", limit: 500 },
        { type: "storage", limit: 100 },
    ];

    // App content sync keeps a language set plus a last-resort fallback translation; CMS
    // syncs every language flat. Both shapes come from syncBatch.
    const appLanguageKeep = langs.length
        ? {
              $or: [
                  { language: { $in: langs } },
                  {
                      $and: langs.map((l) => ({
                          $not: { availableTranslations: { $elemMatch: { $eq: l } } },
                      })),
                  },
              ],
          }
        : {};

    const syncIndexFor = (type: string, subType?: string) =>
        type === "content"
            ? "sync-content-index"
            : `sync-${subType ? subType + "-" : ""}${type}-index`;

    const pushSync = (column: SyncColumn, cms: boolean, firstSync: boolean) => {
        const { type, subType, limit } = column;
        const selector: any = {
            type,
            updatedTimeUtc: { $lte: now, $gte: firstSync ? 0 : now - 7 * DAY },
            memberOf: { $elemMatch: { $in: groups } },
        };
        if (type === "content" && subType) {
            selector.parentType = subType;
            if (cms) selector.language = { $in: ctx.languages };
            else Object.assign(selector, appLanguageKeep);
        }

        const body: any = {
            selector,
            limit,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: syncIndexFor(type, subType),
            identifier: "sync",
        };
        if (cms) body.cms = true;

        const name = subType ? `${type}-${subType}` : type;
        entries.push({
            id: `sync-${name}${cms ? "-cms" : ""}${firstSync ? "-first" : ""}`,
            group: cms ? "sync (cms)" : "sync (app)",
            label: `${
                firstSync ? "first sync (full window)" : "incremental sync"
            } — ${name}, limit ${limit}`,
            source: cms ? "cms/src/sync.ts" : "app/src/sync.ts",
            requiresCmsView: cms,
            method: "POST",
            path: "/query",
            body,
            explain: { selector, limit, sort: body.sort, use_index: body.use_index },
        });
    };

    const pushDeleteCmdSibling = (column: SyncColumn, cms: boolean) => {
        if (column.deleteCmds === false) return;
        // sync() pairs each column with a deleteCmd column keyed on the parent doc type.
        const docType = column.type === "content" ? column.subType! : column.type;
        const selector: any = {
            type: "deleteCmd",
            docType,
            updatedTimeUtc: { $lte: now, $gte: now - 7 * DAY },
            memberOf: { $elemMatch: { $in: groups } },
        };
        const body: any = {
            selector,
            limit: column.limit,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: `sync-${docType}-deleteCmd-index`,
            identifier: "sync",
        };
        if (cms) body.cms = true;
        entries.push({
            id: `sync-deleteCmd-${docType}${cms ? "-cms" : ""}`,
            group: cms ? "sync (cms)" : "sync (app)",
            label: `incremental sync — deleteCmd (${docType})`,
            source: "shared/src/api/sync/sync.ts (deleteCmd sibling)",
            requiresCmsView: cms,
            method: "POST",
            path: "/query",
            body,
            explain: { selector, limit: column.limit, sort: body.sort, use_index: body.use_index },
        });
    };

    const seenDeleteCmd = new Set<string>();
    for (const [columns, cms] of [
        [APP_SYNC, false],
        [CMS_SYNC, true],
    ] as [SyncColumn[], boolean][]) {
        for (const column of columns) {
            pushSync(column, cms, false);
            pushSync(column, cms, true);
            const docType = column.type === "content" ? column.subType! : column.type;
            const key = `${docType}-${cms}`;
            if (column.deleteCmds !== false && !seenDeleteCmd.has(key)) {
                seenDeleteCmd.add(key);
                pushDeleteCmdSibling(column, cms);
            }
        }
    }

    // Content sync narrowed by the client's publishDate cutoff (config.ts floors content
    // publishDateMin; utils.ts resolves the range into the sync column).
    entries.push({
        id: "sync-content-publishDate-window",
        group: "sync (app)",
        label: "incremental sync — content narrowed by the publishDate cutoff",
        source: "shared/src/api/sync/utils.ts + shared/src/config.ts",
        method: "POST",
        path: "/query",
        body: {
            selector: {
                type: "content",
                parentType: "post",
                updatedTimeUtc: { $lte: now, $gte: now - 30 * DAY },
                publishDate: { $gte: now - 365 * DAY },
                memberOf: { $elemMatch: { $in: groups } },
                ...appLanguageKeep,
            },
            limit: 100,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: "sync-content-index",
            identifier: "sync",
        },
    });

    // The app's update-sync path: expiry filter omitted so expiry changes reach offline clients.
    entries.push({
        id: "sync-content-includeExpired",
        group: "sync (app)",
        label: "update sync — content with includeExpired",
        source: "shared/src/api/sync/syncBatch.ts",
        method: "POST",
        path: "/query",
        body: {
            selector: {
                type: "content",
                parentType: "post",
                updatedTimeUtc: { $lte: now, $gte: now - 7 * DAY },
                memberOf: { $elemMatch: { $in: groups } },
                ...appLanguageKeep,
            },
            limit: 100,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: "sync-content-index",
            includeExpired: true,
            identifier: "sync",
        },
    });

    // Synthetic: no client sets alwaysOffline. Kept only to price the index that exists for it.
    entries.push({
        id: "sync-content-alwaysOffline",
        group: "sync (app)",
        label: "content alwaysOffline sync — synthetic, no client sets this flag",
        source: "synthetic — no call site",
        method: "POST",
        path: "/query",
        body: {
            selector: {
                type: "content",
                parentType: "post",
                parentAlwaysOffline: true,
                updatedTimeUtc: { $lte: now, $gte: 0 },
                memberOf: { $elemMatch: { $in: groups } },
                ...appLanguageKeep,
            },
            limit: 100,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: "sync-content-alwaysOffline-index",
            identifier: "sync",
        },
    });

    // ── HybridQuery: the app's read-path supplements ──────────────────────────
    // Every shape below is copied from the call site named in `source`. A `publishDate`
    // sort appears on most of them because CouchDB will not engage a partial index from a
    // bare equality — omit it and the pin is rejected and the query full-scans.
    const hybrid = (id: string, label: string, source: string, body: any) => {
        entries.push({
            id,
            group: "hybridQuery",
            label,
            source,
            method: "POST",
            path: "/query",
            body: { ...body, identifier: "hybridQuery" },
            explain: {
                selector: body.selector,
                limit: body.limit,
                sort: body.sort,
                use_index: body.use_index,
            },
        });
    };

    if (ctx.slugs.length) {
        hybrid(
            "hybrid-by-slug",
            "content by slug — single page load",
            "app/src/pages/SingleContent/SingleContent.vue",
            {
                selector: { $and: [{ type: "content" }, { slug: ctx.slugs[0] }] },
                use_index: "content-slug-publishDate-index",
                sort: [{ publishDate: "desc" }],
                limit: 1,
            },
        );
    }

    if (ctx.parentIds.length) {
        hybrid(
            "hybrid-by-parentId",
            "content by one parentId — what the fan-out actually sends",
            "shared/src/util/HybridQuery/queryIntrospection.ts (fanOut)",
            {
                selector: { $and: [{ type: "content" }, { parentId: ctx.parentIds[0] }] },
                use_index: "content-parentId-publishDate-index",
                sort: [{ publishDate: "desc" }],
                limit: 50,
            },
        );

        // Above FANOUT_MAX_PARENTS the client stops fanning out and posts one query. The
        // fallback is deliberate (it avoids a request storm) but it does full-scan.
        hybrid(
            "hybrid-parentId-fanout-overflow",
            "content by parentId $in, over the 25-parent fan-out cap",
            "shared/src/util/HybridQuery/queryIntrospection.ts (fallback)",
            {
                selector: {
                    $and: [{ type: "content" }, { parentId: { $in: ctx.parentIds.slice(0, 40) } }],
                },
                use_index: "content-parentId-publishDate-index",
                limit: 50,
            },
        );
    }

    hybrid(
        "hybrid-pinned",
        "pinned category feed",
        "app/src/components/HomePage/HomePagePinned.vue",
        {
            selector: { $and: [{ type: "content" }, { parentPinned: 1 }] },
            use_index: "content-parentPinned-publishDate-index",
            sort: [{ publishDate: "desc" }],
            limit: 20,
        },
    );

    hybrid(
        "hybrid-by-tagType",
        "topic listing by parentTagType",
        "app/src/components/ExplorePage/UnpinnedTopics.vue",
        {
            selector: {
                $and: [
                    { type: "content" },
                    { parentTagType: "topic" },
                    { parentTaggedDocs: { $exists: true, $ne: [] } },
                ],
            },
            use_index: "content-parentTagType-publishDate-index",
            sort: [{ publishDate: "desc" }],
            limit: 20,
        },
    );

    if (ctx.content.length) {
        hybrid(
            "hybrid-by-id-list",
            "content by _id list — id-diff supplement (served by the built-in _id index)",
            "shared/src/util/HybridQuery/queryIntrospection.ts (decideContentApiQuery)",
            {
                selector: {
                    $and: [
                        { type: "content" },
                        { _id: { $in: ctx.content.slice(0, 25).map((d) => d._id) } },
                    ],
                },
                limit: 25,
            },
        );
    }

    // Synthetic: no call site sends this. It exists to price the largest page the
    // validator will accept, not to represent real traffic.
    hybrid(
        "hybrid-max-limit",
        "content at the maximum allowed limit (500) — synthetic worst case",
        "synthetic — no call site",
        {
            selector: { $and: [{ type: "content" }, { publishDate: { $lte: now } }] },
            use_index: "content-publishDate-index",
            sort: [{ publishDate: "desc" }],
            limit: 500,
        },
    );

    // ── Full-text search ──────────────────────────────────────────────────────
    // Two real callers: ftsSearchApi (content search, at most one language) and
    // useServerFtsSearch (CMS table search — always matchAllWords plus a field sort).
    const fts = (id: string, label: string, source: string, body: any) => {
        entries.push({
            id,
            group: "fts",
            label,
            source,
            method: "POST",
            path: "/fts",
            body: { apiVersion: "0.0.0", ...body },
            requiresCmsView: body.cms === true,
        });
    };

    const CONTENT_SEARCH = "shared/src/fts/ftsSearchApi.ts";
    const TABLE_SEARCH = "shared/src/fts/useServerFtsSearch.ts";

    fts("fts-common", `content search — frequent term ("${ctx.ftsCommonTerm}")`, CONTENT_SEARCH, {
        queryString: ctx.ftsCommonTerm,
    });
    fts("fts-rare", `content search — rare term ("${ctx.ftsRareTerm}")`, CONTENT_SEARCH, {
        queryString: ctx.ftsRareTerm,
    });
    fts("fts-miss", "content search — term with no matches", CONTENT_SEARCH, {
        queryString: ctx.ftsMissTerm,
    });
    // ftsSearchApi sends at most one language (options.languageId), never a set.
    fts("fts-language", "content search — single language filter", CONTENT_SEARCH, {
        queryString: ctx.ftsCommonTerm,
        languages: langs.slice(0, 1),
    });
    fts("fts-deep-offset", "content search — deep pagination (offset 400)", CONTENT_SEARCH, {
        queryString: ctx.ftsCommonTerm,
        limit: 50,
        offset: 400,
    });
    fts("fts-strict-sorted", "table search — strict match, title sorted", TABLE_SEARCH, {
        queryString: ctx.ftsCommonTerm,
        matchAllWords: true,
        sort: { field: "title", direction: "asc" },
    });
    fts("fts-cms", "content search — CMS scope (all statuses)", CONTENT_SEARCH, {
        queryString: ctx.ftsCommonTerm,
        cms: true,
    });
    if (ctx.userTerm) {
        fts("fts-aux-user", `table search — user ("${ctx.userTerm}")`, TABLE_SEARCH, {
            queryString: ctx.userTerm,
            types: ["user"],
            matchAllWords: true,
            sort: { field: "name", direction: "asc" },
            cms: true,
        });
    }
    if (ctx.redirectTerm) {
        fts("fts-aux-redirect", `table search — redirect ("${ctx.redirectTerm}")`, TABLE_SEARCH, {
            queryString: ctx.redirectTerm,
            types: ["redirect"],
            matchAllWords: true,
            sort: { field: "slug", direction: "asc" },
            cms: true,
        });
    }
    // Synthetic stress shapes: no caller builds queries this long, but they bound the
    // trigram pipeline's worst case.
    fts(
        "fts-multiword",
        "content search — multi-word query (synthetic)",
        "synthetic — stress shape",
        { queryString: `${ctx.ftsCommonTerm} ${ctx.ftsRareTerm}` },
    );
    fts("fts-long", "content search — 200-char query (synthetic)", "synthetic — stress shape", {
        queryString: `${ctx.ftsCommonTerm} ${ctx.ftsRareTerm} `.repeat(6).slice(0, 200),
    });

    // ── Other endpoints and reject paths ──────────────────────────────────────
    entries.push({
        id: "protected",
        group: "other",
        label: "GET /protected — auth guard only, no DB query of its own",
        method: "GET",
        path: "/protected",
        source: "synthetic — isolates auth cost from query cost",
    });
    entries.push(
        ctx.storageBucketId
            ? {
                  id: "storage-status",
                  group: "other",
                  label: "GET /storage/storagestatus — bucket connectivity probe",
                  source: "cms bucket overview",
                  method: "GET",
                  path: `/storage/storagestatus?bucketId=${encodeURIComponent(
                      ctx.storageBucketId,
                  )}&apiVersion=0.0.0`,
                  requiresCmsView: true,
              }
            : {
                  id: "storage-status",
                  group: "rejects",
                  label: "GET /storage/storagestatus — no bucket visible to this identity, validation path only",
                  method: "GET",
                  path: "/storage/storagestatus?apiVersion=0.0.0",
                  expectStatus: 400,
                  source: "cms bucket overview",
              },
    );
    entries.push({
        id: "reject-invalid-index",
        group: "rejects",
        source: "synthetic — reject path",
        label: "rejected — unknown use_index (validator)",
        method: "POST",
        path: "/query",
        body: {
            selector: { type: "content", memberOf: { $elemMatch: { $in: groups } } },
            limit: 10,
            use_index: "no-such-index",
            identifier: "sync",
        },
        expectStatus: 400,
    });
    entries.push({
        id: "reject-over-limit",
        group: "rejects",
        source: "synthetic — reject path",
        label: "rejected — limit above the cap",
        method: "POST",
        path: "/query",
        body: { selector: { type: "content" }, limit: 100000, identifier: "sync" },
        expectStatus: 400,
    });
    entries.push({
        id: "reject-crypto",
        group: "rejects",
        source: "synthetic — reject path",
        label: "rejected — internal crypto doc type",
        method: "POST",
        path: "/query",
        body: { selector: { type: "crypto" }, limit: 10, identifier: "sync" },
        expectStatus: 403,
    });
    entries.push({
        id: "reject-regex",
        group: "rejects",
        source: "synthetic — reject path",
        label: "rejected — $regex operator (data-mining guard)",
        method: "POST",
        path: "/query",
        body: {
            selector: { type: "content", slug: { $regex: ".*" } },
            limit: 10,
            identifier: "sync",
        },
        expectStatus: 400,
    });

    return entries;
}
