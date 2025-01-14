export class httpReq {
    private apiUrl: string;
    private token?: string;
    // private xhr = new XMLHttpRequest();
    constructor(apiUrl: string, token?: string) {
        this.token = token;
        this.apiUrl = apiUrl;
    }

    async post(endpoint: string, body: any, isJSON: boolean = true) {
        const headers: any = isJSON
            ? {
                  Accept: "application/json",
                  "Content-Type": "application/json; charset=utf-8",
              }
            : {};
        this.token && (headers.Authorization = `Bearer ${this.token}`);

        try {
            const schema = "https://";
            const regex = /^https?:\/\//;
            const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
            const res = await fetch(`${url}/${endpoint}`, {
                method: "POST",
                headers: headers,
                body: isJSON ? JSON.stringify(body) : body, // Convert the data to a JSON string
            });
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return await res.json().catch((err) => {
                console.error(err);
            }); // Parse the JSON response
        } catch (err) {
            console.error(err);
        }
    }

    async get(endpoint: string, query: any) {
        const headers: any = {
            "Custom-Body": JSON.stringify(query),
        };
        this.token && (headers.Authorization = `Bearer ${this.token}`);

        try {
            const res = await fetch(`${this.apiUrl}/${endpoint}`, {
                method: "GET",
                headers: headers,
            });
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return res.json(); // Parse the JSON response
        } catch (err) {
            console.error(err);
        }
    }
}
