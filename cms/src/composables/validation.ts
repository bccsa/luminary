import { computed, ref } from "vue";
import { validate as classValidator, ValidationError } from "class-validator";
import { capitalizeFirstLetter } from "@/util/string";

export function useValidation() {
    const validationErrors = ref<ValidationError[]>([]);

    const validate = async (object: object) => {
        const errors = await classValidator(object);

        if (errors.length > 0) {
            validationErrors.value = errors;
        }
    };

    const hasValidationError = computed(() => {
        return validationErrors.value.length > 0;
    });

    // Get a comma-separated list of errors for a field, or undefined if there aren't any
    const fieldError = computed(() => {
        return (field: string) => {
            if (validationErrors.value.length == 0) {
                return undefined;
            }

            const error = validationErrors.value.find((e) => e.property === field);

            if (!error) {
                return undefined;
            }

            return capitalizeFirstLetter(Object.values(error.constraints as object).join(", "));
        };
    });

    return { validate, hasValidationError, validationErrors, fieldError };
}
