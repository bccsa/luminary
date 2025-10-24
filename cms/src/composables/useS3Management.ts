import { ref, readonly } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { apiUrl } from "@/globalConfig";
import type { S3CredentialDto, S3BucketDto } from "luminary-shared";

export type S3BucketConfig = {
    _id?: string;
    name: string;
    fileTypes: string[];
    httpPath: string;
    credential_id?: string;
};

export type CreateBucketRequest = {
    bucket: S3BucketConfig;
    credentials?: S3CredentialDto;
};

export type BucketConnectionTest = {
    bucketName: string;
    connected: boolean;
    message: string;
};

export type FileTypeValidation = {
    bucketName: string;
    mimeType: string;
    valid: boolean;
    message: string;
};

/**
 * Composable for managing S3 bucket configurations via the CMS
 */
export function useS3Management() {
    const { getAccessTokenSilently } = useAuth0();

    const buckets = ref<S3BucketDto[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    /**
     * Create authenticated fetch request
     */
    async function authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
        const token = await getAccessTokenSilently();

        const url = `${apiUrl}/${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Fetch all S3 bucket configurations
     */
    async function fetchBuckets(): Promise<void> {
        try {
            isLoading.value = true;
            error.value = null;

            const response = await authenticatedFetch("s3/buckets");

            if (response && Array.isArray(response)) {
                // Normalize server response to expected client shape
                buckets.value = response.map(
                    (b: any) =>
                        ({
                            ...b,
                            _id: b._id ?? b.id,
                            name: b.name,
                            fileTypes: b.fileTypes ?? [],
                            httpPath: b.httpPath ?? "",
                            credential_id: b.credential_id,
                            endpoint: b.endpoint ?? "",
                        }) as S3BucketDto,
                );
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to fetch S3 buckets";
            console.error("Error fetching S3 buckets:", err);
        } finally {
            isLoading.value = false;
        }
    }

    // Alias for compatibility with existing components
    const loadBuckets = fetchBuckets;

    /**
     * Create a new S3 bucket configuration
     */
    // Accept either a single CreateBucketRequest or (bucket, credentials) pair to be compatible
    async function createBucket(
        bucketOrRequest: CreateBucketRequest | S3BucketConfig,
        maybeCredentials?: S3CredentialDto,
    ): Promise<boolean> {
        const request: CreateBucketRequest =
            // If caller passed the full request object, use it
            (bucketOrRequest as CreateBucketRequest).bucket
                ? (bucketOrRequest as CreateBucketRequest)
                : ({
                      bucket: bucketOrRequest as S3BucketConfig,
                      credentials: maybeCredentials,
                  } as CreateBucketRequest);

        try {
            isLoading.value = true;
            error.value = null;

            const response = await authenticatedFetch("s3/buckets", {
                method: "POST",
                body: JSON.stringify(request),
            });

            if (response?.success) {
                // Refresh the bucket list
                await fetchBuckets();
                return true;
            } else {
                error.value = response?.message || "Failed to create S3 bucket";
                return false;
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to create S3 bucket";
            console.error("Error creating S3 bucket:", err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Update an existing S3 bucket configuration
     */
    async function updateBucket(
        bucketId: string,
        updates: Partial<S3BucketConfig>,
        credentials?: S3CredentialDto,
    ): Promise<boolean> {
        try {
            isLoading.value = true;
            error.value = null;

            const response = await authenticatedFetch(`s3/buckets/${bucketId}`, {
                method: "PUT",
                body: JSON.stringify({
                    bucket: updates,
                    credentials,
                }),
            });

            if (response?.success) {
                // Refresh the bucket list
                await fetchBuckets();
                return true;
            } else {
                error.value = response?.message || "Failed to update S3 bucket";
                return false;
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to update S3 bucket";
            console.error("Error updating S3 bucket:", err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Delete an S3 bucket configuration
     */
    async function deleteBucket(bucketId: string): Promise<boolean> {
        try {
            isLoading.value = true;
            error.value = null;

            const response = await authenticatedFetch(`s3/buckets/${bucketId}`, {
                method: "DELETE",
            });

            if (response?.success) {
                // Refresh the bucket list
                await fetchBuckets();
                return true;
            } else {
                error.value = response?.message || "Failed to delete S3 bucket";
                return false;
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to delete S3 bucket";
            console.error("Error deleting S3 bucket:", err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Test connection to an S3 bucket
     */
    async function testBucketConnection(bucketName: string): Promise<BucketConnectionTest | null> {
        try {
            const response = await authenticatedFetch(`s3/buckets/${bucketName}/test`);
            return response as BucketConnectionTest;
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to test bucket connection";
            console.error("Error testing bucket connection:", err);
            return null;
        }
    }

    /**
     * Validate file type for a bucket
     */
    async function validateFileType(
        bucketName: string,
        mimeType: string,
    ): Promise<FileTypeValidation | null> {
        try {
            const response = await authenticatedFetch(
                `s3/buckets/${bucketName}/validate-filetype?mimetype=${encodeURIComponent(mimeType)}`,
            );
            return response as FileTypeValidation;
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to validate file type";
            console.error("Error validating file type:", err);
            return null;
        }
    }

    /**
     * Reload bucket configurations from the server
     */
    async function reloadBucketConfigurations(): Promise<boolean> {
        try {
            isLoading.value = true;
            error.value = null;

            const response = await authenticatedFetch("s3/buckets/reload", {
                method: "POST",
                body: JSON.stringify({}),
            });

            if (response?.success) {
                // Refresh the bucket list
                await fetchBuckets();
                return true;
            } else {
                error.value = response?.message || "Failed to reload bucket configurations";
                return false;
            }
        } catch (err) {
            error.value =
                err instanceof Error ? err.message : "Failed to reload bucket configurations";
            console.error("Error reloading bucket configurations:", err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    return {
        // State
        buckets: readonly(buckets),
        isLoading: readonly(isLoading),
        error: readonly(error),

        // Actions
        fetchBuckets,
        loadBuckets,
        createBucket,
        updateBucket,
        deleteBucket,
        testBucketConnection,
        validateFileType,
        reloadBucketConfigurations,
    };
}
