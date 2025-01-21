export class HttpReq<T> {
    private apiUrl: string;
    private token?: string;
    // private xhr = new XMLHttpRequest();
    constructor(apiUrl: string, token?: string) {
        this.token = token;
        this.apiUrl = apiUrl;
    }

    async get(endpoint: string, query: T) {
        const headers: any = {
            "X-Query": JSON.stringify(query),
        };
        this.token && (headers.Authorization = `Bearer ${this.token}`);

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
}
