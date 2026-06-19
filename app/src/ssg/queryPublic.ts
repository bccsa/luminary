import type { ContentDto, MangoSelector } from "luminary-shared";

/**
 * Node-safe, unauthenticated `POST /query` for the SSG build (the hybrid-Mango
 * endpoint). Sends NO `Authorization` header → the API resolves the anonymous
 * identity and its default ("public") groups and injects published/expiry/
 * permission/language filters server-side, so only public, published content is
 * returned.
 *
 * Why not reuse shared's `queryRemote`: it throws unless `initHybridQuery(http)`
 * has run (the build never inits shared) AND `HttpReq.post` SWALLOWS errors
 * (returns undefined). A build must fail loudly, so this throws on `!res.ok`.
 *
 * Runs identically in Node (build) and the browser; touches no Dexie/socket.
 */

export type PublicMangoQuery = {
    selector: MangoSelector;
    sort?: Array<Record<string, "asc" | "desc">>;
    limit?: number;
    use_index?: string;
};

const API_URL = import.meta.env.VITE_API_URL;

export async function queryPublic<T = ContentDto>(query: PublicMangoQuery): Promise<T[]> {
    if (!API_URL) throw new Error("VITE_API_URL is not set; cannot query public content");

    const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        // No Authorization header → anonymous identity → public/default groups.
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            selector: query.selector,
            identifier: "ssgQueryPublic", // observability label only
            ...(query.sort ? { sort: query.sort } : {}),
            ...(query.limit !== undefined ? { limit: query.limit } : {}),
            ...(query.use_index ? { use_index: query.use_index } : {}),
        }),
    });

    if (!res.ok) {
        throw new Error(`public /query failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { docs?: T[] };
    return data?.docs ?? [];
}
