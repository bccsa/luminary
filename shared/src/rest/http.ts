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

export class HttpReq<T> {
    private apiUrl: string;

    constructor(apiUrl: string) {
        this.apiUrl = apiUrl;
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
            const schema = "https://";
            const regex = /^https?:\/\//;
            const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
            const res = await fetch(`${url}/${endpoint}`, {
                method: "GET",
                headers: headers,
            });
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return res.json(); // Parse the JSON response
        } catch (err) {
            // do not display error when fetch is unable to contact the api, since the app is build to support offline mode
        }
    }

    async getWithQueryParams(endpoint: string, params: Record<string, string>) {
        const headers: any = { ...customHeaders };

        try {
            const schema = "https://";
            const regex = /^https?:\/\//;
            const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
            const queryParams = new URLSearchParams(params);
            const res = await fetch(`${url}/${endpoint}?${queryParams}`, {
                method: "GET",
                headers: headers,
            });
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return res.json().catch((err) => {
                console.log(err.message);
            }); // Parse the JSON response
        } catch (err) {
            console.log(err);
        }
    }

    async post(endpoint: string, query: T | FormData) {
        try {
            const schema = "https://";
            const regex = /^https?:\/\//;
            const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
            const isFormData = query instanceof FormData;
            const headers: any = {
                ...(!isFormData && { "Content-Type": "application/json" }),
                ...customHeaders,
            };
            const res = await fetch(`${url}/${endpoint}`, {
                method: "POST",
                headers,
                body: isFormData ? query : JSON.stringify(query),
            });
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return await res.json().catch((err) => {
                console.log(err.message);
            });
        } catch (err) {
            console.log(err);
        }
    }
}
