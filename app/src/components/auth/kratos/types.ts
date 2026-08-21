/** The non-secret provider fields these screens need, as carried on an `AuthProviderDto`. */
export type AuthProviderOption = {
    id: string;
    label: string;
    iconUrl?: string;
    backgroundColor?: string;
    textColor?: string;
};

/** Kratos message types, as they arrive on `ui.messages[].type`. */
export type AuthMessageType = "info" | "error" | "success";
