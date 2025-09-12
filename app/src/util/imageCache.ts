/**
 * Image caching utility using IndexedDB for offline support
 */

interface CachedImage {
    url: string;
    blob: Blob;
    timestamp: number;
    contentType: string;
}

class ImageCache {
    private dbName = "luminary-image-cache";
    private storeName = "images";
    private version = 1;
    private db: IDBDatabase | null = null;

    async initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: "url" });
                    store.createIndex("timestamp", "timestamp");
                }
            };
        });
    }

    async cacheImage(url: string): Promise<void> {
        if (!this.db) await this.initDB();

        try {
            // Check if already cached
            const existing = await this.getCachedImage(url);
            if (existing) return;

            // Fetch and cache the image
            const response = await fetch(url);
            if (!response.ok) return;

            const blob = await response.blob();
            const transaction = this.db!.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);

            const cachedImage: CachedImage = {
                url,
                blob,
                timestamp: Date.now(),
                contentType: response.headers.get("content-type") || "image/jpeg",
            };

            store.put(cachedImage);
        } catch (error) {
            console.warn("Failed to cache image:", url, error);
        }
    }

    async getCachedImage(url: string): Promise<string | null> {
        if (!this.db) await this.initDB();

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);

            request.onsuccess = () => {
                if (request.result) {
                    const cached: CachedImage = request.result;
                    // Create blob URL for the cached image
                    const blobUrl = URL.createObjectURL(cached.blob);
                    resolve(blobUrl);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => resolve(null);
        });
    }

    async getCachedImageForUrls(urls: string[]): Promise<string | null> {
        for (const url of urls) {
            const cachedUrl = await this.getCachedImage(url);
            if (cachedUrl) {
                return cachedUrl;
            }
        }
        return null;
    }

    async clearOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
        if (!this.db) await this.initDB();

        const cutoff = Date.now() - maxAge;
        const transaction = this.db!.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        const index = store.index("timestamp");

        const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    }
}

export const imageCache = new ImageCache();

/**
 * Preload and cache images when online
 */
export const preloadImages = (urls: string[]) => {
    if (navigator.onLine) {
        urls.forEach((url) => {
            imageCache.cacheImage(url);
        });
    }
};

/**
 * Get cached image URL or return null if not cached
 */
export const getCachedImageUrl = async (urls: string[]): Promise<string | null> => {
    return await imageCache.getCachedImageForUrls(urls);
};
