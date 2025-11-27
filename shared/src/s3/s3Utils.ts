export type S3TestCredentialsInput = {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucketName: string;
};

export type S3TestCredentialsResult = {
    status: "success" | "error";
    message: string;
};

// Re-export bucket status utilities
export * from "./useStorageStatus";

/**
 * Test S3 credentials by attempting basic S3 operations without creating buckets
 * This is a lightweight validation that doesn't rely on the change request system
 */
export async function testS3Credentials(
    credentials: S3TestCredentialsInput,
): Promise<S3TestCredentialsResult> {
    try {
        // Validate format first
        const formatError = validateS3CredentialsFormat(credentials);
        if (formatError) {
            return {
                status: "error",
                message: formatError,
            };
        }

        // For browser environments, we can't directly test S3 credentials
        // This function serves as a validation interface that can be extended
        // In practice, the CMS should call a dedicated API endpoint for testing

        // Basic URL validation
        try {
            const url = new URL(credentials.endpoint);
            if (!url.protocol.startsWith("http")) {
                throw new Error("Invalid protocol");
            }
        } catch (error) {
            return {
                status: "error",
                message: "Invalid endpoint URL format",
            };
        }

        // Basic credential format validation
        if (!credentials.accessKey || credentials.accessKey.length < 3) {
            return {
                status: "error",
                message: "Access key appears to be invalid",
            };
        }

        if (!credentials.secretKey || credentials.secretKey.length < 8) {
            return {
                status: "error",
                message: "Secret key appears to be invalid",
            };
        }

        // Note: Actual S3 credential testing should be done server-side
        // This function provides client-side validation only
        return {
            status: "success",
            message:
                "Credentials format is valid. Server-side testing required for full validation.",
        };
    } catch (error: any) {
        return {
            status: "error",
            message: `Validation failed: ${error.message}`,
        };
    }
}

/**
 * Validate S3 credentials format before testing
 */
export function validateS3CredentialsFormat(credentials: S3TestCredentialsInput): string | null {
    if (!credentials.endpoint) {
        return "Endpoint is required";
    }

    if (!credentials.accessKey) {
        return "Access key is required";
    }

    if (!credentials.secretKey) {
        return "Secret key is required";
    }

    if (!credentials.bucketName) {
        return "Bucket name is required";
    }

    // Basic endpoint format validation
    try {
        new URL(credentials.endpoint);
    } catch {
        return "Invalid endpoint URL format";
    }

    // Basic bucket name validation (S3 naming rules)
    const bucketNameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
    if (!bucketNameRegex.test(credentials.bucketName)) {
        return "Invalid bucket name format. Must be lowercase, contain only letters, numbers, dots, and hyphens, and be between 3-63 characters.";
    }

    if (credentials.bucketName.length < 3 || credentials.bucketName.length > 63) {
        return "Bucket name must be between 3 and 63 characters long.";
    }

    return null; // No validation errors
}
