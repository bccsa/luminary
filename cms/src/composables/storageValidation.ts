import { ref, watch, computed, type Ref } from "vue";
import type { StorageDto, S3CredentialDto } from "luminary-shared";

// Validation system following EditContentValidation pattern
type Validation = {
    id: string;
    isValid: boolean;
    message: string;
};

function validate<T>(
    message: string,
    id: string,
    validationsList: Validation[],
    value: T,
    callback: (val: T) => boolean,
) {
    const validation = validationsList.find((v) => v.id == id);
    if (!validation) {
        validationsList.push({ id, isValid: callback(value), message });
        return;
    }
    validation.isValid = callback(value);
}

export function storageValidation(
    bucket: Ref<StorageDto | undefined>,
    localCredentials: Ref<S3CredentialDto>,
    isEditing: Ref<boolean>,
) {
    const validations = ref([] as Validation[]);
    const isFormValid = ref(true);
    const hasAttemptedSubmit = ref(false);
    const touchedFields = ref<Set<string>>(new Set());

    // Computed credential checks
    const endpointProvided = computed(() => !!localCredentials.value.endpoint?.trim());
    const bucketNameProvided = computed(() => !!localCredentials.value.bucketName?.trim());
    const accessKeyProvided = computed(() => !!localCredentials.value.accessKey?.trim());
    const secretKeyProvided = computed(() => !!localCredentials.value.secretKey?.trim());

    // Computed to check if all credential fields are provided
    const hasCompleteCredentials = computed(
        () =>
            endpointProvided.value &&
            bucketNameProvided.value &&
            accessKeyProvided.value &&
            secretKeyProvided.value,
    );

    // Computed to check if any credential fields are provided
    const hasPartialCredentials = computed(
        () =>
            endpointProvided.value ||
            bucketNameProvided.value ||
            accessKeyProvided.value ||
            secretKeyProvided.value,
    );

    // Computed to determine if credentials are valid (all or none)
    const hasValidCredentials = computed(() => {
        if (!hasPartialCredentials.value) return false; // No credentials provided
        return hasCompleteCredentials.value; // All credentials must be provided if any are provided
    });

    // Real-time validation watcher
    watch(
        [bucket, localCredentials, isEditing],
        () => {
            const b = bucket.value;
            if (!b) return;

            // Clear previous validations
            validations.value = [];

            // Validate bucket name
            validate(
                "Bucket name is required",
                "bucketName",
                validations.value,
                b,
                (bkt) => !!bkt.name?.trim(),
            );

            // Validate bucket name format
            validate(
                "Bucket name: 3-63 chars, alphanumeric characters, spaces, hyphens, and periods allowed",
                "bucketNameFormat",
                validations.value,
                b,
                (bkt) => {
                    const name = bkt.name?.trim();
                    if (!name) return true; // Skip if empty (handled by required validation)

                    // Length check
                    if (name.length < 3 || name.length > 63) return false;

                    // Allow alphanumeric, spaces, hyphens, and periods
                    if (!/^[a-zA-Z0-9.\s-]+$/.test(name)) return false;

                    return true;
                },
            );

            // Validate Public URL
            validate(
                "Public URL is required",
                "publicUrl",
                validations.value,
                b,
                (bkt) => !!bkt.publicUrl?.trim(),
            );

            // Validate Public URL format (must start with http:// or https://)
            validate(
                "Public URL must start with http:// or https://",
                "publicUrlFormat",
                validations.value,
                b,
                (bkt) => {
                    const path = bkt.publicUrl?.trim();
                    if (!path) return true; // Skip if empty (handled by required validation)
                    return path.startsWith("http://") || path.startsWith("https://");
                },
            );

            // Validate credentials for new buckets
            if (!isEditing.value) {
                validate(
                    "S3 credentials are required when creating a new bucket",
                    "credentialsRequired",
                    validations.value,
                    b,
                    () => hasValidCredentials.value,
                );
            }

            // Validate credential completeness if any are provided
            if (hasPartialCredentials.value) {
                validate(
                    "S3 endpoint is required when providing credentials",
                    "endpoint",
                    validations.value,
                    localCredentials.value,
                    () => endpointProvided.value,
                );

                // Validate endpoint format (must start with http:// or https://)
                validate(
                    "Endpoint must start with http:// or https://",
                    "endpointFormat",
                    validations.value,
                    localCredentials.value,
                    (c) => {
                        const endpoint = c.endpoint?.trim();
                        if (!endpoint) return true; // Skip if empty (handled by required validation)
                        return endpoint.startsWith("http://") || endpoint.startsWith("https://");
                    },
                );

                validate(
                    "Bucket name is required when providing credentials",
                    "bucketName",
                    validations.value,
                    localCredentials.value,
                    () => bucketNameProvided.value,
                );

                validate(
                    "Access key is required when providing credentials",
                    "accessKey",
                    validations.value,
                    localCredentials.value,
                    () => accessKeyProvided.value,
                );

                validate(
                    "Secret key is required when providing credentials",
                    "secretKey",
                    validations.value,
                    localCredentials.value,
                    () => secretKeyProvided.value,
                );
            }

            // Update form validity
            isFormValid.value = validations.value.every((v) => v.isValid);
        },
        { immediate: true, deep: true },
    );

    // Helper function to get validation error for a specific field
    const getFieldValidation = (fieldId: string) => {
        return validations.value.find((v) => v.id === fieldId);
    };

    // Helper function to mark a field as touched
    const touchField = (fieldId: string) => {
        touchedFields.value.add(fieldId);
    };

    // Helper function to check if a field has an error and should show it
    const hasFieldError = (fieldId: string) => {
        const validation = getFieldValidation(fieldId);
        // Show error if field has been touched OR form has been submitted
        const shouldShow = touchedFields.value.has(fieldId) || hasAttemptedSubmit.value;
        return shouldShow && validation && !validation.isValid;
    };

    // Reset validation state
    const resetValidation = () => {
        hasAttemptedSubmit.value = false;
        touchedFields.value.clear();
    };

    return {
        validations,
        isFormValid,
        hasAttemptedSubmit,
        touchedFields,
        hasCompleteCredentials,
        hasPartialCredentials,
        hasValidCredentials,
        endpointProvided,
        bucketNameProvided,
        accessKeyProvided,
        secretKeyProvided,
        getFieldValidation,
        touchField,
        hasFieldError,
        resetValidation,
    };
}
