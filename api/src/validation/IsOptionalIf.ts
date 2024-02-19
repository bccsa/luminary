import type { ValidationOptions } from "class-validator";
import { ValidateIf } from "class-validator";

/**
 * Checks (in case of condition passed) if the value is missing and if so, ignores all validators.
 * From https://github.com/typestack/class-validator/issues/1455#issuecomment-1000846977
 *
 * @IsOptionalIf((o) => o && o?.source === 'instore', { always: true })
 */
export function IsOptionalIf(
    condition: (object: any, value: any) => boolean,
    validationOptions?: ValidationOptions,
): PropertyDecorator {
    return ValidateIf((object: Record<string, unknown>, value: string): boolean => {
        return !condition(object, value) ? true : value !== null && value !== undefined;
    }, validationOptions);
}
