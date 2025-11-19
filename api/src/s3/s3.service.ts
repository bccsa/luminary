import * as Minio from "minio";
import { S3CredentialDto } from "../dto/S3CredentialDto";
import { DbService } from "../db/db.service";
import { retrieveCryptoData, decryptObject } from "../util/encryption";
import { DocType } from "../enums";

export class S3Service {
    private static instances: Map<string, S3Service> = new Map();
    private static credentialIdToInstanceMap: Map<string, Set<string>> = new Map();
    private static dbChangeListener: ((update: any) => void) | null = null;
    private client: Minio.Client;
    private credentialId: string;
    private bucketName: string;

    /**
     * Initialize the database change listener for credential updates
     * This should be called once when the application starts
     */
    static initializeChangeListener(db: DbService): void {
        if (S3Service.dbChangeListener) {
            return; // Already initialized
        }

        S3Service.dbChangeListener = async (doc: any) => {
            if (doc && doc.type == DocType.Crypto && doc._id && doc.data && doc.data) {
                const credentialId = doc._id;

                // Check if any S3Service instances use this credential
                const affectedBucketIds = S3Service.credentialIdToInstanceMap.get(credentialId);
                if (affectedBucketIds && affectedBucketIds.size > 0) {
                    try {
                        // Decrypt the updated credentials
                        const updatedCredentials = await decryptObject<S3CredentialDto>(doc.data);

                        // Update all affected S3Service instances
                        for (const bucketId of affectedBucketIds) {
                            const instance = S3Service.instances.get(bucketId);
                            if (instance) {
                                await instance.init(updatedCredentials);
                                console.log(
                                    `Updated S3 credentials for bucket ${bucketId} (credential ${credentialId})`,
                                );
                            }
                        }
                    } catch (error) {
                        console.error(
                            `Failed to update S3 credentials for credential ${credentialId}:`,
                            error,
                        );
                    }
                }
            }
        };

        // Subscribe to database changes
        db.on("update", S3Service.dbChangeListener);
    }

    /**
     * Initialize or update the S3 client with credentials
     */
    private async init(credentials: S3CredentialDto): Promise<void> {
        // Parse endpoint to extract host and determine SSL/port defaults
        const url = new URL(credentials.endpoint);
        const host = url.hostname;
        const port = parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
        const useSSL = url.protocol === "https:";

        const clientConfig: any = {
            endPoint: host,
            port: port,
            useSSL: useSSL,
            accessKey: credentials.accessKey,
            secretKey: credentials.secretKey,
            region: "auto",
        };

        this.client = new Minio.Client(clientConfig);
        this.bucketName = credentials.bucketName;
    }

    /**
     * Gets or creates an S3Service instance for the specified bucket
     * Uses singleton pattern to reuse existing instances
     * @param bucketId The ID of the StorageDto document in the database
     * @param db Database service to retrieve bucket configuration and credentials
     */
    static async create(bucketId: string, db: DbService): Promise<S3Service> {
        // Return existing instance if available
        if (S3Service.instances.has(bucketId)) {
            return S3Service.instances.get(bucketId)!;
        }

        // Create new instance
        const service = new S3Service();

        // Get bucket configuration
        const result = await db.getDoc(bucketId);
        if (!result.docs || result.docs.length === 0) {
            throw new Error(`Bucket with ID ${bucketId} not found`);
        }

        const bucket = result.docs[0];

        // Credentials are stored encrypted via credential_id reference
        if (!bucket.credential_id) {
            throw new Error("No credentials configured for bucket");
        }

        service.credentialId = bucket.credential_id;

        // Retrieve encrypted credentials
        const credentials = await retrieveCryptoData<S3CredentialDto>(db, bucket.credential_id);

        // Initialize the service with credentials
        await service.init(credentials);

        // Store instance in cache
        S3Service.instances.set(bucketId, service);

        // Track credential ID to bucket ID mapping for change listener
        if (!S3Service.credentialIdToInstanceMap.has(bucket.credential_id)) {
            S3Service.credentialIdToInstanceMap.set(bucket.credential_id, new Set());
        }
        S3Service.credentialIdToInstanceMap.get(bucket.credential_id)!.add(bucketId);

        return service;
    }

    /**
     * Clears the instance cache. Useful for testing or when credentials change.
     * @param bucketId Optional bucket ID to clear a specific instance. If not provided, clears all.
     */
    static clearCache(bucketId?: string): void {
        if (bucketId) {
            const instance = S3Service.instances.get(bucketId);
            if (instance) {
                // Remove from credential mapping
                const credentialSet = S3Service.credentialIdToInstanceMap.get(
                    instance.credentialId,
                );
                if (credentialSet) {
                    credentialSet.delete(bucketId);
                    if (credentialSet.size === 0) {
                        S3Service.credentialIdToInstanceMap.delete(instance.credentialId);
                    }
                }
            }
            S3Service.instances.delete(bucketId);
        } else {
            S3Service.instances.clear();
            S3Service.credentialIdToInstanceMap.clear();
        }
    }

    /**
     * Get the Minio client instance
     */
    public getClient(): Minio.Client {
        return this.client;
    }

    /**
     * Get the bucket name
     */
    public getBucketName(): string {
        return this.bucketName;
    }

    /**
     * Uploads a file to an S3 bucket
     */
    public async uploadFile(key: string, file: Buffer, mimetype: string) {
        const metadata = {
            "Content-Type": mimetype,
        };
        return this.client.putObject(this.bucketName, key, file, file.length, metadata);
    }

    /**
     * Removes objects from a bucket
     */
    public async removeObjects(keys: string[]) {
        return this.client.removeObjects(this.bucketName, keys);
    }

    /**
     * Get an object from a bucket
     */
    public async getObject(key: string) {
        return this.client.getObject(this.bucketName, key);
    }

    /**
     * Checks if a bucket exists
     */
    public async bucketExists() {
        return this.client.bucketExists(this.bucketName);
    }

    /**
     * Creates a bucket. We are not using this in production code, but it is useful for testing.
     */
    public async makeBucket() {
        return this.client.makeBucket(this.bucketName);
    }

    /**
     * Removes a bucket. We are not using this in production code, but it is useful for testing.
     */
    public async removeBucket() {
        return this.client.removeBucket(this.bucketName);
    }

    /**
     * Lists objects in a bucket
     */
    public async listObjects() {
        return this.client.listObjects(this.bucketName);
    }

    /**
     * Check if an S3 service is reachable
     */
    public async checkConnection(): Promise<boolean> {
        // Check if S3 service is reachable by attempting to list buckets
        try {
            await this.client.listBuckets();
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Check if an object exists in a bucket
     */
    public async objectExists(key: string): Promise<boolean> {
        try {
            await this.client.statObject(this.bucketName, key);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate image upload and accessibility
     */
    public async validateImageUpload(key: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Check if bucket exists
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                return { success: false, error: `Bucket '${this.bucketName}' does not exist` };
            }

            // Try to get object info to verify it was uploaded successfully
            await this.client.statObject(this.bucketName, key);

            return { success: true };
        } catch (error) {
            return { success: false, error: `Image validation failed: ${error.message}` };
        }
    }

    /**
     * Check if uploaded images are accessible
     */
    public async checkImageAccessibility(keys: string[]): Promise<string[]> {
        const inaccessibleImages: string[] = [];

        for (const key of keys) {
            try {
                await this.client.statObject(this.bucketName, key);
            } catch (error) {
                inaccessibleImages.push(key);
            }
        }

        return inaccessibleImages;
    }

    /**
     * Check bucket connectivity using internal credentials
     */
    public async checkBucketConnectivity(): Promise<{
        status: "connected" | "unreachable" | "unauthorized" | "not-found";
        message?: string;
    }> {
        try {
            // Check if the bucket exists using the internal client
            const exists = await this.client.bucketExists(this.bucketName);
            if (!exists) {
                console.log(`Bucket '${this.bucketName}' does not exist on the storage provider.`);
                return {
                    status: "not-found",
                    message: `Bucket '${this.bucketName}' does not exist`,
                };
            }

            return { status: "connected" };
        } catch (error) {
            // Check for specific error types
            if (
                error.message?.includes("Access Denied") ||
                error.message?.includes("SignatureDoesNotMatch") ||
                error.message?.includes("InvalidAccessKeyId") ||
                error.message?.includes("Forbidden") ||
                error.code === "SignatureDoesNotMatch" ||
                error.code === "InvalidAccessKeyId" ||
                error.code === "AccessDenied"
            ) {
                return {
                    status: "unauthorized",
                    message: "Invalid credentials or insufficient permissions",
                };
            } else if (
                error.message?.includes("ENOTFOUND") ||
                error.message?.includes("ECONNREFUSED") ||
                error.message?.includes("EHOSTUNREACH")
            ) {
                return {
                    status: "unreachable",
                    message: "Cannot connect to S3 endpoint",
                };
            } else {
                return {
                    status: "unreachable",
                    message: error.message || "Unknown connection error",
                };
            }
        }
    }
}
