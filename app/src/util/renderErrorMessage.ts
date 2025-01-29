import { capitaliseFirstLetter } from "./string";

export function renderErrorMessage(errorMessage: string | undefined) {
    if (!errorMessage) {
        return "";
    }

    return capitaliseFirstLetter(errorMessage.replace(/^[^.]*\./, ""));
}
