// Validation functions
export type Validation = {
    id: string;
    isValid: boolean;
    message: string;
};

/**
 * Validate a value and store the validation result in the passed validations list
 * @param message - display message
 * @param validationsList - list where validation result should be stored
 * @param id - unique validation id
 * @param value - value to be validated
 * @param callback - validation function
 * @param overallValidationsList - combined list for all validations
 */
export function validate<T>(
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
