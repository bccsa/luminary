/**
 * CouchDB connection strings carry inline credentials, which Node's fetch
 * refuses outright ("Request cannot be constructed from a URL that includes
 * credentials"). They are moved into an Authorization header here, which also
 * keeps the password out of anything that logs the URL.
 */

export type CouchConfig = {
    /** e.g. `http://admin:password@localhost:5984` */
    connectionString: string;
    database: string;
};

type Split = { base: string; headers: Record<string, string> };

function split(connectionString: string): Split {
    const url = new URL(connectionString);
    const headers: Record<string, string> = {};

    if (url.username || url.password) {
        const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(
            url.password,
        )}`;
        headers.authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
        url.username = "";
        url.password = "";
    }

    return { base: url.toString().replace(/\/+$/, ""), headers };
}

/** Credential-free URL, safe to put in an error message. */
export function couchUrl(couch: CouchConfig, path = ""): string {
    const { base } = split(couch.connectionString);
    return path ? `${base}/${couch.database}/${path}` : `${base}/${couch.database}`;
}

export type CouchFetchOptions = RequestInit & { timeoutMs?: number };

/** Fetch against a database path, with credentials applied as a header. */
export async function couchFetch(
    couch: CouchConfig,
    path = "",
    options: CouchFetchOptions = {},
): Promise<Response> {
    const { headers: authHeaders } = split(couch.connectionString);
    const { timeoutMs, headers, ...init } = options;

    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
        return await fetch(couchUrl(couch, path), {
            ...init,
            headers: { ...authHeaders, ...(headers as Record<string, string>) },
            signal: controller.signal,
        });
    } finally {
        if (timer) clearTimeout(timer);
    }
}
