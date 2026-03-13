import { config } from "../config";

let activeProviderIdGetter: () => string | null = () => null;

export function setAuthProviderGetter(getter: () => string | null) {
    activeProviderIdGetter = getter;
}

export function getActiveProviderId(): string | null {
    return activeProviderIdGetter();
}

export class HttpReq<T> {
    private apiUrl: string;
    private token?: string;

    constructor(apiUrl: string, token?: string) {
        this.token = token;
        this.apiUrl = apiUrl;
    }

    /** Use config.token when set (e.g. after login), otherwise constructor token. */
    private getToken(): string | undefined {
        return config?.token ?? this.token;
    }

    async get(endpoint: string, query: T) {
        console.warn(
            "The API GET call containing an X-Query header is deprecated and should be replaced with POST calls containing a MangoQuery",
        );
        const headers: any = {
            "X-Query": JSON.stringify(query),
        };
        const providerId = activeProviderIdGetter();
        if (providerId) {
            headers["x-auth-provider-id"] = providerId;
        }
        const token = this.getToken();
        token && (headers.Authorization = `Bearer ${token}`);

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
        const headers: any = {};
        const providerId = activeProviderIdGetter();
        if (providerId) {
            headers["x-auth-provider-id"] = providerId;
        }
        const token = this.getToken();
        token && (headers.Authorization = `Bearer ${token}`);

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
            const token = this.getToken();
            const headers: any = {
                Authorization: token ? `Bearer ${token}` : "",
                ...(!isFormData && { "Content-Type": "application/json" }),
            };
            const providerId = activeProviderIdGetter();
            if (providerId) {
                headers["x-auth-provider-id"] = providerId;
            }
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
