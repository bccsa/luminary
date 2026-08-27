import type { CouchConfig } from "./seedProvider";

/**
 * A stack that is not fully up otherwise surfaces as an unexplained timeout deep
 * in a spec, so every dependency is probed once up front with a message that
 * names what to start.
 */

const PROBE_TIMEOUT_MS = 5_000;

async function probe(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function fail(what: string, url: string, hint: string, cause?: unknown): never {
    const reason = cause instanceof Error ? ` (${cause.message})` : "";
    throw new Error(`E2E preflight: ${what} is not reachable at ${url}${reason}.\n  ${hint}`);
}

/** Any HTTP response proves the port is served; the status itself does not matter. */
export async function assertServing(what: string, url: string, hint: string): Promise<void> {
    try {
        await probe(url);
    } catch (error) {
        fail(what, url, hint, error);
    }
}

export async function assertCouchDatabase(couch: CouchConfig): Promise<void> {
    const base = couch.connectionString.replace(/\/+$/, "");
    const url = `${base}/${couch.database}`;
    let response: Response;

    try {
        response = await probe(url);
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
                `  Create it with: curl -X PUT ${url}`,
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
    const base = couch.connectionString.replace(/\/+$/, "");
    const response = await probe(`${base}/${couch.database}/_all_docs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            keys: ["group-super-admins", "group-public-content", "user-editor1"],
        }),
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
