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

    const sync = (
        id: string,
        label: string,
        type: string,
        useIndex: string,
        opts: { subType?: string; cms?: boolean; firstSync?: boolean; extra?: any } = {},
    ) => {
        const selector: any = {
            type,
            updatedTimeUtc: { $lte: now, $gte: opts.firstSync ? 0 : now - 7 * DAY },
            memberOf: { $elemMatch: { $in: groups } },
            ...(opts.extra ?? {}),
        };
        const body: any = {
            selector,
            limit: SYNC_LIMIT,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: useIndex,
            identifier: "sync",
        };
        if (opts.cms) body.cms = true;
        entries.push({
            id,
            group: opts.cms ? "sync (cms)" : "sync (app)",
            label,
            method: "POST",
            path: "/query",
            body,
            requiresCmsView: opts.cms,
            source: "shared/src/api/sync/syncBatch.ts",
            explain: {
                selector,
                limit: SYNC_LIMIT,
                sort: [{ updatedTimeUtc: "desc" }],
                use_index: useIndex,
            },
        });
    };

    // ── Sync: simple doc types ────────────────────────────────────────────────
    for (const [type, index] of [
        ["post", "sync-post-index"],
        ["tag", "sync-tag-index"],
        ["language", "sync-language-index"],
        ["group", "sync-group-index"],
        ["redirect", "sync-redirect-index"],
        ["defaultAffinity", "sync-defaultAffinity-index"],
    ] as const) {
        sync(`sync-${type}`, `incremental sync — ${type}`, type, index);
        sync(`sync-${type}-first`, `first sync (full window) — ${type}`, type, index, {
            firstSync: true,
        });
    }

    // CMS-only doc types.
    for (const [type, index] of [
        ["user", "sync-user-index"],
        ["storage", "sync-storage-index"],
        ["authProvider", "sync-authProvider-index"],
    ] as const) {
        sync(`sync-${type}-cms`, `incremental sync — ${type}`, type, index, { cms: true });
    }

    // ── Sync: content, the heaviest and most-varied shape ─────────────────────
    const languageKeep = langs.length
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

    for (const parentType of ["post", "tag"] as const) {
        sync(
            `sync-content-${parentType}`,
            `incremental sync — content (${parentType}, language keep)`,
            "content",
            "sync-content-index",
            { extra: { parentType, ...languageKeep } },
        );
        sync(
            `sync-content-${parentType}-first`,
            `first sync (full window) — content (${parentType})`,
            "content",
            "sync-content-index",
            { firstSync: true, extra: { parentType, ...languageKeep } },
        );
        sync(
            `sync-content-${parentType}-cms`,
            `incremental sync — content (${parentType}, all languages)`,
            "content",
            "sync-content-index",
            { cms: true, extra: { parentType, language: { $in: ctx.languages } } },
        );
    }

    sync(
        "sync-content-alwaysOffline",
        "incremental sync — content (alwaysOffline parents)",
        "content",
        "sync-content-alwaysOffline-index",
        { extra: { parentType: "post", parentAlwaysOffline: true, ...languageKeep } },
    );

    // The app's update-sync path: expiry filter omitted so expiry changes reach offline clients.
    entries.push({
        id: "sync-content-includeExpired",
        group: "sync (app)",
        source: "shared/src/api/sync/syncBatch.ts",
        label: "update sync — content with includeExpired",
        method: "POST",
        path: "/query",
        body: {
            selector: {
                type: "content",
                parentType: "post",
                updatedTimeUtc: { $lte: now, $gte: now - 7 * DAY },
                memberOf: { $elemMatch: { $in: groups } },
                ...languageKeep,
            },
            limit: SYNC_LIMIT,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: "sync-content-index",
            includeExpired: true,
            identifier: "sync",
        },
    });

    // Content sync narrowed by the client's publishDate cutoff.
    entries.push({
        id: "sync-content-publishDate-window",
        group: "sync (app)",
        source: "shared/src/api/sync/syncBatch.ts",
        label: "incremental sync — content narrowed by publishDate cutoff",
        method: "POST",
        path: "/query",
        body: {
            selector: {
                type: "content",
                parentType: "post",
                updatedTimeUtc: { $lte: now, $gte: now - 30 * DAY },
                publishDate: { $gte: now - 365 * DAY },
                memberOf: { $elemMatch: { $in: groups } },
                ...languageKeep,
            },
            limit: SYNC_LIMIT,
            sort: [{ updatedTimeUtc: "desc" }],
            use_index: "sync-content-index",
            identifier: "sync",
        },
    });

    // ── Sync: delete commands ─────────────────────────────────────────────────
    for (const [docType, index] of [
        ["content", "sync-content-deleteCmd-index"],
        ["post", "sync-post-deleteCmd-index"],
        ["tag", "sync-tag-deleteCmd-index"],
        ["language", "sync-language-deleteCmd-index"],
        ["group", "sync-group-deleteCmd-index"],
        ["redirect", "sync-redirect-deleteCmd-index"],
        ["user", "sync-user-deleteCmd-index"],
        ["storage", "sync-storage-deleteCmd-index"],
        ["authProvider", "sync-authProvider-deleteCmd-index"],
        ["defaultAffinity", "sync-defaultAffinity-deleteCmd-index"],
    ] as const) {
        sync(
            `sync-deleteCmd-${docType}`,
            `incremental sync — deleteCmd (${docType})`,
            "deleteCmd",
            index,
            {
                extra: { docType },
            },
        );
    }

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
    const fts = (id: string, label: string, body: any) => {
        entries.push({
            id,
            group: "fts",
            label,
            method: "POST",
            path: "/fts",
            body: { apiVersion: "0.0.0", ...body },
            requiresCmsView: body.cms === true,
            source: "shared/src/api/RestApi.ts (fts)",
        });
    };

    fts("fts-common", `content search — frequent term ("${ctx.ftsCommonTerm}")`, {
        queryString: ctx.ftsCommonTerm,
    });
    fts("fts-rare", `content search — rare term ("${ctx.ftsRareTerm}")`, {
        queryString: ctx.ftsRareTerm,
    });
    fts("fts-miss", "content search — term with no matches", { queryString: ctx.ftsMissTerm });
    fts("fts-multiword", "content search — multi-word query", {
        queryString: `${ctx.ftsCommonTerm} ${ctx.ftsRareTerm}`,
    });
    fts("fts-long", "content search — long query (worst-case trigram count)", {
        queryString: `${ctx.ftsCommonTerm} ${ctx.ftsRareTerm} `.repeat(6).slice(0, 200),
    });
    fts("fts-languages", "content search — language filtered", {
        queryString: ctx.ftsCommonTerm,
        languages: langs,
    });
    fts("fts-deep-offset", "content search — deep pagination (offset 400)", {
        queryString: ctx.ftsCommonTerm,
        limit: 50,
        offset: 400,
    });
    fts("fts-strict-sorted", "content search — strict match, title sorted", {
        queryString: ctx.ftsCommonTerm,
        matchAllWords: true,
        sort: { field: "title", direction: "asc" },
    });
    fts("fts-cms", "content search — CMS scope (all statuses)", {
        queryString: ctx.ftsCommonTerm,
        cms: true,
    });
    if (ctx.userTerm) {
        fts("fts-aux-user", `aux search — user ("${ctx.userTerm}")`, {
            queryString: ctx.userTerm,
            types: ["user"],
            cms: true,
        });
    }
    if (ctx.redirectTerm) {
        fts("fts-aux-redirect", `aux search — redirect ("${ctx.redirectTerm}")`, {
            queryString: ctx.redirectTerm,
            types: ["redirect"],
            cms: true,
        });
    }

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
