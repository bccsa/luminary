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

    // multipart/form-data possible solution:
    // async post(endpoint: string, formData: FormData) {
    //     try {
    //         const schema = "https://";
    //         const regex = /^https?:\/\//;
    //         const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
    //         const res = await fetch(`${url}/${endpoint}`, {
    //             method: "POST",
    //             headers: {
    //                 Authorization: this.token ? `Bearer ${this.token}` : "",
    //             },
    //             body: formData,
    //         });
    //         if (!res.ok) {
    //             throw new Error(`HTTP error! Status: ${res.status}`);
    //         }
    //         return await res.json().catch((err) => {
    //             console.log(err.message);
    //         });
    //     } catch (err) {
    //         console.log(err);
    //     }
    // }

    async post(endpoint: string, query: T) {
        // It was decided to use multipart/form-data, so this will have to change
        // Possible solution to send image array buffers along with the json data inside the form data:
        // 1. Create a new FormData object
        // 2. Append the JSON data as a string
        // 3. Append the image array buffers as Blob objects
        // 4. Send the FormData object in the fetch request
        // 5. On the server side, parse the FormData object to extract the JSON
        //    data and the image array buffers
        try {
            const schema = "https://";
            const regex = /^https?:\/\//;
            const url = regex.test(this.apiUrl) ? this.apiUrl : `${schema}${this.apiUrl}`;
            const res = await fetch(`${url}/${endpoint}`, {
                method: "POST",
                headers: {
                    Authorization: this.token ? `Bearer ${this.token}` : "",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(query),
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
