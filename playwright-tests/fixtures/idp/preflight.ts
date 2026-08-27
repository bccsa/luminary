import { couchFetch, couchUrl, type CouchConfig } from "./couch";

/**
 * A stack that is not fully up otherwise surfaces as an unexplained timeout deep
 * in a spec, so every dependency is probed once up front with a message that
 * names what to start.
 */

const PROBE_TIMEOUT_MS = 5_000;

function fail(what: string, url: string, hint: string, cause?: unknown): never {
    const reason = cause instanceof Error ? ` (${cause.message})` : "";
    throw new Error(`E2E preflight: ${what} is not reachable at ${url}${reason}.\n  ${hint}`);
}

/** Any HTTP response proves the port is served; the status itself does not matter. */
export async function assertServing(what: string, url: string, hint: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        await fetch(url, { signal: controller.signal });
    } catch (error) {
        fail(what, url, hint, error);
    } finally {
        clearTimeout(timer);
    }
}

export async function assertCouchDatabase(couch: CouchConfig): Promise<void> {
    const url = couchUrl(couch);
    let response: Response;

    try {
        response = await couchFetch(couch, "", { timeoutMs: PROBE_TIMEOUT_MS });
    } catch (error) {
        fail("CouchDB", url, "Start it with api/scripts/start-couchdb-in-ci.sh.", error);
    }

    if (response.status === 401 || response.status === 403) {
        throw new Error(
            `E2E preflight: CouchDB rejected the credentials in E2E_COUCHDB_URL (${response.status}).\n` +
                "  Include admin credentials, e.g. http://admin:password@localhost:5984",
        );
    }

    if (response.status === 404) {
        throw new Error(
            `E2E preflight: CouchDB database "${couch.database}" does not exist.\n` +
                `  Create it with: curl -X PUT "$E2E_COUCHDB_URL/${couch.database}"`,
        );
    }

    if (!response.ok) {
        throw new Error(`E2E preflight: CouchDB returned ${response.status} for ${url}.`);
    }
}

/**
 * The personas resolve through the seeded Group and User docs, so an unseeded
 * database yields empty access maps rather than an obvious failure.
 */
export async function assertSeeded(couch: CouchConfig): Promise<void> {
    const response = await couchFetch(couch, "_all_docs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            keys: ["group-super-admins", "group-public-content", "user-editor1"],
        }),
        timeoutMs: PROBE_TIMEOUT_MS,
    });

    const body = (await response.json()) as { rows?: Array<{ error?: string; id?: string }> };
    const missing = (body.rows ?? []).filter((row) => row.error).length;

    if (missing > 0) {
        throw new Error(
            "E2E preflight: the database is missing seeded Group/User docs the personas rely on.\n" +
                "  Seed it with: npm run seed (in api/)",
        );
    }
}
