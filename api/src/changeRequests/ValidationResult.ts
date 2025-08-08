export type ValidationResult = {
    validated: boolean;
    error?: string;
    warnings?: string[];
    validatedData?: any;
};
