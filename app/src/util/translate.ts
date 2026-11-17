let translate: (key: string) => string = (key) => key;

/** Lets non-component actions use the application's active i18n instance. */
export function setTranslator(translator: (key: string) => string): void {
    translate = translator;
}

export function translateMessage(key: string): string {
    return translate(key);
}
