import { serverError } from "../config";

const customHeaders: Record<string, string> = {};

/**
 * Set a global HTTP header that will be sent with every request made through HttpReq.
 * Headers set this way are in-memory only and do not persist across page reloads —
 * clients are responsible for re-applying them on boot.
 */
export function setCustomHeader(name: string, value: string) {
    customHeaders[name] = value;
}

/**
 * Remove a previously set global HTTP header.
 */
export function removeCustomHeader(name: string) {
    delete customHeaders[name];
}

/**
 * Handle HTTP responses, signalling 5xx errors via the serverError ref so
 * consumers can show a localized notification.
 */
async function handleResponse(res: Response) {
    if (res.ok) {
        return res.json().catch((err) => {
            console.log(err.message);
        });
    }

    if (res.status >= 500) {
        let message: string | undefined;
        try {
            const body = await res.json();
            if (body.message) message = body.message;
        } catch {
            // Body may be empty or non-JSON; leave message undefined.
        }
        serverError.value = { status: res.status, message };
        return undefined;
    }

    // Client error (4xx) - warn and return undefined
    console.warn(`HTTP error: ${res.status} ${res.statusText}`);
    return undefined;
}

export class HttpReq<T> {
    private apiUrl: string;

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
    }

    private getUrl() {
        const schema = "https://";
        const regex = /^https?:\/\//;
        return regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
    }

    async get(endpoint: string, query: T) {
        console.warn(
            "The API GET call containing an X-Query header is deprecated and should be replaced with POST calls containing a MangoQuery",
        );
        const headers: any = {
            "X-Query": JSON.stringify(query),
            ...customHeaders,
        };

        try {
            const res = await fetch(`${this.getUrl()}/${endpoint}`, {
                method: "GET",
                headers: headers,
            });
            return await handleResponse(res);
        } catch (err) {
            // do not display error when fetch is unable to contact the api, since the app is build to support offline mode
        }
    }

    async getWithQueryParams(endpoint: string, params: Record<string, string>) {
        const headers: any = { ...customHeaders };

        try {
            const queryParams = new URLSearchParams(params);
            const res = await fetch(`${this.getUrl()}/${endpoint}?${queryParams}`, {
                method: "GET",
                headers: headers,
            });
            return await handleResponse(res);
        } catch (err) {
            console.log(err);
        }
    }

    async post(endpoint: string, query: T | FormData) {
        try {
            const isFormData = query instanceof FormData;
            const headers: any = {
                ...(!isFormData && { "Content-Type": "application/json" }),
                ...customHeaders,
            };
            const res = await fetch(`${this.getUrl()}/${endpoint}`, {
                method: "POST",
                headers,
                body: isFormData ? query : JSON.stringify(query),
            });
            return await handleResponse(res);
        } catch (err) {
            console.log(err);
        }
    }
}
