import { capitalizeFirstLetter } from "./string";

export function renderErrorMessage(errorMessage: string | undefined) {
    if (!errorMessage) {
        return "";
    }

    return capitalizeFirstLetter(errorMessage.replace(/^[^.]*\./, ""));
}
