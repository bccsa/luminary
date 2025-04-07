// Validation functions
export type Validation = {
    id: string;
    isValid: boolean;
    message: string;
};

/**
 * Validate a value and store the validation result in the passed validations list
 * @param message - display message
 * @param id - unique validation id
 * @param validationsList - list where validation result should be stored
 * @param value - value to be validated
 * @param callback - validation function
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
